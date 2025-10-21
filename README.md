# Outlight Customer Support (MVP)

- API: Node/TS + Express (pps/api)
- DB: Supabase Postgres (Prisma)
- Gmail: OAuth, poll ingest

## Dev quick start
1) Create \.env.local\ (see \.env.example\)
2) \
pm run dev\ (API on http://localhost:3001)
3) Connect Gmail: http://localhost:3001/oauth/google
4) Seed: \Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/gmail/poll\

> Never commit \.env.local\.
