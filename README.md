# Outlight Customer Support (MVP)

- API: Node/TS + Express (apps/api)
- Web UI: Next.js + React + Tailwind CSS (apps/web)
- DB: Supabase Postgres (Prisma)
- Gmail: OAuth, poll ingest

## Dev quick start

### Initial Setup
1. Create `.env.local` (see `.env.example`)
2. Install root dependencies: `npm install`
3. Install web dependencies: `cd apps/web && npm install && cd ../..`
4. Connect Gmail: Start API and visit http://localhost:3001/oauth/google
5. Seed emails:
   - PowerShell: `Invoke-RestMethod -Method Post -Uri http://localhost:3001/gmail/poll`
   - Bash/Linux: `curl -X POST http://localhost:3001/gmail/poll`

### Running the Application

**Option 1: Run both together (Recommended)**
```bash
npm run dev:all
```
- API runs on http://localhost:3001
- Web UI runs on http://localhost:3000
- Both processes run concurrently with colored output

**Option 2: Run separately (Two terminals)**

Terminal 1 - API:
```bash
npm run dev
```

Terminal 2 - Web UI:
```bash
npm run dev:web
```

### Access the App
- **Web UI**: http://localhost:3000
- **API**: http://localhost:3001

## Features

### Current MVP UI
- **Email Inbox**: View all customer email conversations
- **Email Thread View**: Read full conversation history
- **Reply Interface**: Send replies directly from the app
- **Dark Mode**: Clean, minimal Notion-like design
- **Real-time Updates**: Automatically refreshes after sending replies

### Architecture
- **Backend (Port 3001)**:
  - Express API with Prisma ORM
  - Gmail OAuth & email polling
  - Conversation and message endpoints

- **Frontend (Port 3000)**:
  - Next.js with App Router
  - Server-side rendering
  - API proxy to backend
  - Responsive dark mode UI

> Never commit `.env.local`.
