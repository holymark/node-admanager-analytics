# Ad Manager Report Tool

A simple Node.js + TypeScript application that fetches performance reports from the **Google Ad Manager (GAM)** API using the **SOAP** interface. It supports Google OAuth2 login for authentication and demonstrates how to retrieve basic report data (impressions, clicks, etc.) from the Ad Manager network.

## Features

- Google OAuth2 authentication
- Fetches Ad Manager report via SOAP
- Supports mock data for testing without a real account
- TypeScript support
- Deployed and ready for preview

##  Live Demo

🔗 [Visit the live app](https://node-admanager-analytics.onrender.com)


##  Tech Stack

- Node.js + Express
- TypeScript
- Google APIs (`googleapis`)
- SOAP (via `soap` package)
- OAuth2 authentication
- Render (for deployment) 

##  Getting Started

### 1. Clone the Repo

```bash
git clone https://github.com/holymark/node-admanager-analytics.git
cd node-admanager-analytics
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Create a `.env` file with the following:

```env
CLIENT_ID=your-google-client-id
CLIENT_SECRET=your-google-client-secret
REDIRECT_URI=http://localhost:8080/oauth2callback
```

### 4. Run the Server

```bash
npm run dev
```

Server runs on [http://localhost:8080](http://localhost:8080)

## Report Output

The tool fetches the following metrics for the past week:

- **Date**
- **Ad Server Impressions**
- **Ad Server Clicks**
- **Ad Server CTR**
- **Ad Server CPM and CPC Revenue**



[MIT](LICENSE)
