import { config } from "dotenv";

// Load env the way Next.js does for local dev: `.env.local` takes precedence,
// then `.env`. dotenv does not override already-set keys, so loading
// `.env.local` first makes it win over `.env` and over nothing in the shell.
config({ path: ".env.local" });
config({ path: ".env" });
