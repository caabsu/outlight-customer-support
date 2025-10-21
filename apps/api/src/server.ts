import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { googleAuthStart, googleAuthCallback, pollOnce } from "./gmail";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

app.get("/oauth/google", googleAuthStart);
app.get("/oauth/google/callback", googleAuthCallback);
app.post("/gmail/poll", pollOnce);

const port = process.env.PORT || 3001;
app.listen(port, () => console.log("API listening on", port));