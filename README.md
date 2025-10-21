# Outlight Customer Support (MVP)

- API: Node/TS + Express (apps/api)
- Web UI: Next.js + React + Tailwind CSS (apps/web)
- DB: Supabase Postgres (Prisma)
- Gmail: OAuth, poll ingest

## Dev quick start

### Backend Setup
1. Create `.env.local` (see `.env.example`)
2. Run `npm run dev` (API on http://localhost:3001)
3. Connect Gmail: http://localhost:3001/oauth/google
4. Seed emails: `curl -X POST http://localhost:3001/gmail/poll`

### Frontend Setup
1. Install web dependencies: `cd apps/web && npm install`
2. Run web UI: `npm run dev:web` (Web on http://localhost:3000)

### Run Both Together
- Run: `npm run dev:all` (API on :3001, Web on :3000)

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
