import { google, Auth } from "googleapis";
import * as path from "path";
import * as dotenv from "dotenv";
import { Client, createClientAsync } from "soap";
import util from "util";


dotenv.config({ path: path.join(__dirname, "../../.env") });

interface AdManagerSoapClient extends Client {
  makeTestNetwork?: (args: any, callback: (err: any, result: any, rawResponse: any, soapHeader: any, rawRequest: any) => void) => void; // Typed callback
}

interface Network {
  networkCode: string;
  displayName: string;
  testNetwork: boolean;
}


interface MakeTestNetworkResponse {
  rval: Network;
}

const AD_MANAGER_API_VERSION = "v202405";
const WSDL_URL = `https://ads.google.com/apis/ads/publisher/${AD_MANAGER_API_VERSION}/NetworkService?wsdl`;

const oauth2Client: Auth.OAuth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);


oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});


const SCOPES = ["https://www.googleapis.com/auth/admanager"];

async function createTestAdManagerNetwork(): Promise<string> {
  try {

    const { credentials } = await oauth2Client.refreshAccessToken();
    if (!credentials.access_token) throw new Error("Access token missing after refresh");
    oauth2Client.setCredentials(credentials);
    const accessToken = credentials.access_token;
    console.log("Access Token:", accessToken);


    const client = await createClientAsync(WSDL_URL) as AdManagerSoapClient;
    console.log("Available SOAP Methods:", Object.keys(client));


    const soapHeader = {
      "ns1:RequestHeader": {
        "ns1:networkCode": "0", 
        "ns1:applicationName": "Ad Manager Tracking Tool",
        "ns1:authentication": {
          "ns1:oauth2Token": accessToken,
        },
      },
    };

    client.addSoapHeader(
      soapHeader,
      "",
      "ns1",
      `https://www.google.com/apis/ads/publisher/${AD_MANAGER_API_VERSION}`
    );

    client.on("request", xml => console.log("SOAP Request:", xml));
    client.on("response", xml => console.log("SOAP Response:", xml));
    client.on("soapError", err => console.error("SOAP Error:", err));

    if (!client.makeTestNetwork) {
      throw new Error("makeTestNetwork method not found on SOAP client. Check WSDL compatibility.");
    }

    const makeTestNetworkAsync = util.promisify<
      {},
      [MakeTestNetworkResponse]
    >(client.makeTestNetwork).bind(client);
    console.log("🚀 Attempting to create test network...");
    const result = await makeTestNetworkAsync({});
    const testNetwork: Network = result[0].rval; // Type assertion based on WSDL response

    console.log("\n✅ Test Ad Manager Network Created!");
    console.log("Network Code:", testNetwork.networkCode);
    console.log("Display Name:", testNetwork.displayName);
    console.log("Is Test Network:", testNetwork.testNetwork);

    return testNetwork.networkCode;

  } catch (error: any) {
    console.error("\n🔥 Failed to create test network:", error.message || error);
    if (error.response?.data) {
      console.error("SOAP Error Response:", error.response.data);
    } else if (error.root?.Fault) {
      console.error("SOAP Fault:", error.root.Fault);
    }
    if (error.response?.status === 401) {
      console.error("\n⚠️ 401 Unauthorized: Possible causes:");
      console.error("- The refresh_token may not have the admanager scope. Re-authorize with https://www.googleapis.com/auth/admanager.");
      console.error("- A test network may already exist for this login. Check your Ad Manager account or contact support.");
      console.error("- The Google Cloud project may not have the Ad Manager API enabled. Enable it at https://console.cloud.google.com/apis.");
    }
    throw new Error("Test network creation failed. Please address the issues above.");
  }
}

// run to get a valid network code from test network:
// ts-node src/utils/createTestAdManagerNetwork.ts
createTestAdManagerNetwork()
  .then(code => {
    console.log(`\n🎯 Use this Test Network Code in your app: ${code}`);
  })
  .catch((err) => {
    console.error("\n🚫 Could not create test network. Please check logs above.");
  });