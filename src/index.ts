import express, { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import { createClient, Client } from 'soap';
import cors from "cors";
import { google } from "googleapis";
import util from "util";
import axios from "axios";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const WSDL_URL = "https://ads.google.com/apis/ads/publisher/v202505/ReportService?wsdl";

function getSoapHeader(networkCode: string, accessToken: string) {
  return {
    RequestHeader: {
      networkCode: networkCode,
      applicationName: "Ad Manager Tracking Tool",
      authentication: {
        oauth2Token: accessToken,
      },
    },
  };
}

app.get("/auth", (req: Request, res: Response) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/dfp"],
  });

  res.json({ url: authUrl });
});

app.get("/oauth2callback", async (req: Request, res: Response) => {
  const { code } = req.query;

  const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    res.redirect(`/?access_token=${tokens.access_token}`);
  } catch (err) {
    console.error("OAuth2 error:", err);
    res.status(500).send("Authentication failed");
  }
});

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type SoapCallback = (err: any, result: any, rawResponse: any, soapHeader: any, rawRequest: any) => void;

interface GamReportServiceClient extends Client {
  runReportJob: (args: any, callback: SoapCallback) => void;
  getReportJobStatus: (args: any, callback: SoapCallback) => void;
  getReportDownloadURL: (args: any, callback: SoapCallback) => void;
}


app.get("/report", async (req: Request, res: Response) : Promise<any> => {
  const { token, networkCode } = req.query;
  if (!token || !networkCode) {
    return res.status(400).json({ error: "Missing token or networkCode" });
  }


  try {
    // await new Promise(resolve => setTimeout(resolve, 100));

    const createClientAsync = util.promisify(createClient);
    const client = await createClientAsync(WSDL_URL);

    const gamClient = client as GamReportServiceClient;


    const runReportJobAsync = util.promisify(gamClient.runReportJob).bind(gamClient);
    const getReportJobStatusAsync = util.promisify(gamClient.getReportJobStatus).bind(gamClient);
    const getReportDownloadURLAsync = util.promisify(gamClient.getReportDownloadURL).bind(gamClient);

    gamClient.addSoapHeader(
      getSoapHeader(networkCode as string, token as string),
      "",
      "ns1",
      "https://www.google.com/apis/ads/publisher/v202505"
    );

    const reportJobRequest = {
      reportJob: {
        reportQuery: {
          dimensions: ["DATE", "AD_UNIT_NAME"],
          columns: [
            "AD_SERVER_IMPRESSIONS",
            "AD_SERVER_CLICKS",
            "AD_SERVER_CTR",
            "AD_SERVER_CPM_AND_CPC_REVENUE"
          ],
          dateRangeType: "LAST_WEEK",
        },
      },
    };

    console.log("Submitting report job...");
    const initialReportJobResult: any = await runReportJobAsync(reportJobRequest);
    const jobId = initialReportJobResult.rval.id;
    console.log(`Report job submitted with ID: ${jobId}`);

    let reportStatus = "IN_PROGRESS";
    let attempts = 0;
    const maxAttempts = 30;
    const pollInterval = 5000;

    while (reportStatus === "IN_PROGRESS" && attempts < maxAttempts) {
      console.log(`Polling report job status for ID ${jobId}... (Attempt ${attempts + 1}/${maxAttempts})`);
      await delay(pollInterval);
      const statusResult: any = await getReportJobStatusAsync({ reportJobId: jobId });
      reportStatus = statusResult.rval;
      console.log(`Current report status: ${reportStatus}`);
      attempts++;
    }

    if (reportStatus === "COMPLETED") {
      console.log("Report job completed! Fetching download URL...");
      const downloadURLResult: any = await getReportDownloadURLAsync({
        reportJobId: jobId,
        exportFormat: "TSV",

      });
      const downloadUrl = downloadURLResult.rval;
      console.log(`Report download URL: ${downloadUrl}`);



      const reportResponse = await axios.get(downloadUrl, { responseType: 'text' });
      const reportData = reportResponse.data;



      return res.json({
        jobId: jobId,
        status: reportStatus,
        downloadUrl: downloadUrl,
        reportContent: reportData,

        message: "Report fetched successfully"
      });

    } else if (reportStatus === "FAILED") {
      console.error(`Report job failed for ID: ${jobId}`);
      return res.status(500).json({ error: `Report job failed with status: ${reportStatus}` });
    } else {
      console.error(`Report job timed out for ID: ${jobId}. Final status: ${reportStatus}`);
      return res.status(504).json({ error: "Report generation timed out." });
    }

  } catch (e: any) {
    console.error("Report error:", e);
    if (e.response && e.response.data) {
      return res.status(500).json({ error: "SOAP API error", details: e.message, responseData: e.response.data });
    }
    return res.status(500).json({ error: e.message });
  }
  
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});