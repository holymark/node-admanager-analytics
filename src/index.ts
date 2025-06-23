import express, { Request, Response, NextFunction, Express } from "express";
import dotenv from "dotenv";
import path from "path";
import cors, { CorsOptions } from "cors";
import jwt, { VerifyErrors, JwtPayload, VerifyCallback } from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { google, Auth } from "googleapis";
import { createClient, Client } from "soap";
import util from "util";
import axios, { AxiosResponse } from "axios";

const tokenStore: Map<string, string> = new Map();

dotenv.config();

const app: Express = express();
const PORT: number = parseInt(process.env.PORT || "8080", 10);
const JWT_SECRET: string = process.env.JWT_SECRET || "dev_secret"; 

const corsOptions: CorsOptions = {
  origin: process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : [process.env.REDIRECT_URI!.replace("/oauth2callback", "")],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(cookieParser());

const oauth2Client: Auth.OAuth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID || "",
  process.env.CLIENT_SECRET || "",
  process.env.REDIRECT_URI || ""
);

const WSDL_URL: string = "https://ads.google.com/apis/ads/publisher/v202505/ReportService?wsdl";

interface SoapHeader {
  "ns1:RequestHeader": {
    "ns1:networkCode": string;
    "ns1:applicationName": string;
    "ns1:authentication": {
      "ns1:oauth2Token": string;
    };
  };
}

function getSoapHeader(networkCode: string, accessToken: string): SoapHeader {
  return {
    "ns1:RequestHeader": {
      "ns1:networkCode": networkCode,
      "ns1:applicationName": "Ad Manager Tracking Tool",
      "ns1:authentication": {
        "ns1:oauth2Token": accessToken,
      },
    },
  };
}

interface CustomRequest extends Request {
  body: {
    userId?: string;
  };
}

const authenticateToken = (
  req: CustomRequest,
  res: Response,
  next: NextFunction
): void => {
  req.body = req.body || {};

  const token: string | undefined = req.headers["authorization"]?.split(" ")[1] || req.cookies.jwt;
  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  console.log("Verifying token:", token.substring(0, 10) + "..."); 
  jwt.verify(token, JWT_SECRET, (err: VerifyErrors | null, decoded: string | JwtPayload | undefined) => {
    if (err) {
      console.error("JWT Verification Error:", err.message);
      res.status(403).json({ error: "Invalid token" });
      return;
    }
    if (typeof decoded === "undefined") {
      console.error("Decoded token is undefined after verification");
      res.status(403).json({ error: "Invalid token payload" });
      return;
    }
    const userId = typeof decoded === "string" ? decoded : decoded?.userId;
    if (!userId) {
      console.error("No userId found in decoded token");
      res.status(403).json({ error: "Token lacks userId" });
      return;
    }
    req.body.userId = userId;
    next();
  });
};

app.get("/auth", (req: Request, res: Response) => {
  const authUrl: string = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/admanager", "profile", "email"],
    prompt: "consent",
    state: req.query.state as string | undefined || "state",
  });
  res.json({ url: authUrl });
});

interface OAuthTokens extends Auth.Credentials {
  expiry_date?: number;
}

app.get("/oauth2callback", async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code) {
    res.status(400).json({ error: "Authorization code missing" });
    return;
  }

  try {
    const { tokens }: { tokens: Auth.Credentials } = await oauth2Client.getToken(code);
    console.log({ tokens });
    if (!tokens.access_token || !tokens.refresh_token) {
      res.status(400).json({ error: "Missing access token or refresh token" });
      return;
    }

    oauth2Client.setCredentials(tokens);

    const userId: string = `user_${Date.now()}`;
    tokenStore.set(userId, tokens.refresh_token);

    const jwtToken: string = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });

    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    const { data: userinfo } = await oauth2.userinfo.get();

    res.cookie("jwt", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.redirect(
      `${process.env.REDIRECT_URI!.replace("/oauth2callback", "")}?name=${encodeURIComponent(userinfo.name || "")}&email=${userinfo.email}&picture=${encodeURIComponent(
        userinfo.picture || ""
      )}&jwt=${encodeURIComponent(jwtToken)}`
    );
  } catch (err: any) {
    console.error("OAuth2 error:", err);
    res.status(500).json({ error: "Authentication failed", details: err.message });
  }
});


function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


interface SoapCallback {
  (err: any, result: any, rawResponse: any, soapHeader: any, rawRequest: any): void;
}

interface GamReportServiceClient extends Client {
  runReportJob: (args: any, callback: SoapCallback) => void;
  getReportJobStatus: (args: any, callback: SoapCallback) => void;
  getReportDownloadURL: (args: any, callback: SoapCallback) => void;
}


app.get("/report", authenticateToken, async (req: CustomRequest, res: Response) => {
  const networkCode: string | undefined = req.query.networkCode as string | undefined;
  const userId: string | undefined = req.body.userId;

  if (!networkCode || !userId) {
    res.status(400).json({ error: "Missing required parameters" });
    return;
  }

  try {

    const refresh_token: string | undefined = tokenStore.get(userId);
    if (!refresh_token) {
      res.status(401).json({ error: "No refresh token found for user" });
      return;
    }

    oauth2Client.setCredentials({ refresh_token });
    const { credentials } = await oauth2Client.refreshAccessToken();
    const accessToken: string = credentials.access_token ?? "";
    if (!accessToken) {
      res.status(401).json({ error: "Failed to obtain valid access token" });
      return;
    }

    const createClientAsync = util.promisify(createClient);
    const client = await createClientAsync(WSDL_URL);
    const gamClient = client as GamReportServiceClient;

    gamClient.addSoapHeader(
      getSoapHeader(networkCode, accessToken),
      "",
      "ns1",
      "https://www.google.com/apis/ads/publisher/v202505"
    );

    const runReportJobAsync = util.promisify(gamClient.runReportJob).bind(gamClient);
    const getReportJobStatusAsync = util.promisify(gamClient.getReportJobStatus).bind(gamClient);
    const getReportDownloadURLAsync = util.promisify(gamClient.getReportDownloadURL).bind(gamClient);

    const reportJobRequest = {
      reportJob: {
        reportQuery: {
          dimensions: ["DATE", "AD_UNIT_NAME"],
          columns: [
            "AD_SERVER_IMPRESSIONS",
            "AD_SERVER_CLICKS",
            "AD_SERVER_CTR",
            "AD_SERVER_CPM_AND_CPC_REVENUE",
          ],
          dateRangeType: "LAST_WEEK",
        },
      },
    };

    const initialReportJobResult: any = await runReportJobAsync(reportJobRequest);
    const jobId: string = initialReportJobResult.rval.id;

    let reportStatus: string = "IN_PROGRESS";
    let attempts: number = 0;
    const maxAttempts: number = 30;
    const pollInterval: number = 5000;

    while (reportStatus === "IN_PROGRESS" && attempts < maxAttempts) {
      await delay(pollInterval);
      const statusResult: any = await getReportJobStatusAsync({ reportJobId: jobId });
      reportStatus = statusResult.rval.reportJobStatus;
      attempts++;
    }

    if (reportStatus === "COMPLETED") {
      const downloadURLResult: any = await getReportDownloadURLAsync({
        reportJobId: jobId,
        exportFormat: "TSV",
      });
      const downloadUrl: string = downloadURLResult.rval.url;
      const reportResponse: AxiosResponse<string> = await axios.get(downloadUrl, { responseType: "text" });
      const reportData: string = reportResponse.data;

      const rows: string[] = reportData.trim().split("\n");
      const headers: string[] = rows[0].split("\t");
      const table: Record<string, string>[] = rows.slice(1).map((row: string) => {
        const values: string[] = row.split("\t");
        return headers.reduce((acc: Record<string, string>, h: string, i: number) => ({
          ...acc,
          [h]: values[i] || "N/A",
        }), {});
      });

      res.json({
        jobId,
        status: reportStatus,
        reportTable: table,
        message: "Report fetched successfully",
      });
    } else if (reportStatus === "FAILED") {
      res.status(500).json({ error: `Report job failed with status: ${reportStatus}` });
    } else {
      res.status(504).json({ error: "Report generation timed out" });
    }
  } catch (e: any) {
    console.error("Report error:", e);
    res.status(500).json({ error: e.message });
  }
});


app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

app.listen(PORT, () => {
  console.log(`Server running at ${process.env.REDIRECT_URI!.replace("/oauth2callback", "")}`);
});

