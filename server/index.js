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
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/dfp",
      "https://www.googleapis.com/auth/analytics.readonly",
      // "https://www.googleapis.com/auth/admanager.readonly", invalid scope
    ]
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
  if (!networkCode) {
    return res.status(400).json({ error: "Missing networkCode" });
  }

  // Serve mock data for testing (hardcoded code, just a dummyproof)
  if (networkCode === "21808260008") {
    return res.json({
      reportJob: {
        id: 123456,
        status: "COMPLETED"
      },
      reportData: [
        { date: "2025-06-10", impressions: 1500, clicks: 65, earnings: "$10.23" },
        { date: "2025-06-11", impressions: 1750, clicks: 72, earnings: "$12.47" },
        { date: "2025-06-12", impressions: 1600, clicks: 68, earnings: "$11.34" },
        { date: "2025-06-13", impressions: 1900, clicks: 90, earnings: "$13.56" },
        { date: "2025-06-14", impressions: 2100, clicks: 95, earnings: "$15.78" },
      ]
    });
  }

  if (!token) {
    return res.status(400).json({ error: "Missing token" });
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
