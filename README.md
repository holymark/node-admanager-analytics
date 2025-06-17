#  Ad Manager Report Tool

A lightweight analytics tool for tracking Google Ad Manager and AdSense earnings using OAuth login. Users can authenticate, input their Ad Manager network code, and fetch weekly reports on impressions and clicks.

---

## 🔧 Features

- ✅ Google OAuth2 login
- ✅ Ad Manager report generation (impressions & clicks)
- ✅ Multi-Customer Network (MCN) support
- ✅ Loading states for improved UX
- ✅ Mock data mode for testing (enter `mock` as network code)
- ✅ Mobile-friendly, Tailwind-powered UI

---

## 🚀 Usage

### 1. Setup

Create a `.env` file in the root:

```bash
CLIENT_ID=your_google_client_id
CLIENT_SECRET=your_google_client_secret
REDIRECT_URI=http://localhost:8080/oauth2callback
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Server

```bash
npm start
```

Server will run at: `http://localhost:8080`

---

## 🌐 OAuth Scopes Used

- `https://www.googleapis.com/auth/dfp` – Access Ad Manager API
- `https://www.googleapis.com/auth/analytics.readonly` – (Reserved for future analytics integration)

---

## 🧪 Mock Report Testing

To simulate report output without actual API calls, input:

```
mock
```

into the network code field on the frontend. Mock data is returned from the backend.

---

## 📦 Deploy

Can be deployed to services like Vercel, Render, or Cloud Workstations.

---

## ✅ MCN Support

If your account is part of an MCN (Multi-Customer Network), just input the appropriate `networkCode` and your earnings will be tracked separately.

---

## 💡 Todo

- [ ] Daily report filters
- [ ] AdSense integration
- [ ] Save reports per user

---

## 📄 License

MIT
