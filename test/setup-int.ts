import "reflect-metadata";
import { loadEnvFile } from "@/shared/infra/config/load-env";

// T3.01: test defaults first, so they win over the files below
// (`loadEnvFile` never overwrites a variable that is already set).
process.env.NODE_ENV ??= "test";
process.env.LOG_LEVEL ??= "silent";

// `.env` (local overrides, CI copies `.env.example`), then `.env.example`
// to fill whatever is missing, so a fresh clone runs without a `.env`.
loadEnvFile(".env");
loadEnvFile(".env.example");

// Placeholder: per-worker isolated databases arrive in T3.11.
