const express = require("express");
const { google } = require("googleapis");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();
const app = express();
const PORT = 8080;

// Serve static files (frontend)
app.use(express.static(path.join(__dirname, "public")));

console.log(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
)
// Google OAuth setup
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Start OAuth flow
app.get("/auth", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/dfp"]
  });
  res.json({ url: authUrl });
});

// OAuth2 redirect callback
app.get("/oauth2callback", async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const token = tokens.access_token;
    res.redirect(`/?access_token=${token}`);
  } catch (err) {
    console.error("OAuth error:", err);
    res.status(500).send("Authentication failed.");
  }
});

// Report fetch
app.get("/report", async (req, res) => {
  const { token, networkCode } = req.query;
  if (!token || !networkCode) {
    return res.status(400).json({ error: "Missing token or networkCode" });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });

  const adManager = google.admanager({
    version: "v202405",
    auth,
    params: { networkCode }
  });

  try {
    const result = await adManager.reports.runReportJob({
      requestBody: {
        reportQuery: {
          dimensions: ["DATE"],
          columns: ["AD_SERVER_IMPRESSIONS", "AD_SERVER_CLICKS"],
          dateRangeType: "LAST_WEEK"
        }
      }
    });

    res.json(result.data);
  } catch (error) {
    console.error("Report error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
