#!/usr/bin/env node
/**
 * run-carousel-local.js
 * Script local para rodar o carousel agent no Mac.
 * Conecta ao PostgreSQL do Railway via DATABASE_URL e gera os carrosséis localmente
 * com Higgsfield CLI (disponível apenas no Mac).
 *
 * Uso manual:
 *   node src/scripts/run-carousel-local.js
 *
 * Variáveis necessárias no .env.local (ou ambiente):
 *   DATABASE_URL     — PostgreSQL URL do Railway (railway variables --service worker)
 *   ANTHROPIC_API_KEY
 *
 * Para agendar no Mac (launchd), veja docs/carousel-launchd.md
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// Load .env.local first, fallback to .env
dotenvConfig({ path: resolve(ROOT, ".env.local") });
dotenvConfig({ path: resolve(ROOT, ".env") });

import { loadConfig } from "../config.js";
import { PgDb } from "../pg-db.js";
import { JsonDb } from "../db.js";
import { runCarouselAgent } from "../agents/carousel-agent.js";

const config = loadConfig();

const db = config.databaseUrl
  ? new PgDb(config.databaseUrl)
  : new JsonDb(resolve(config.dataFile));

await db.load();
console.log("carousel_local_db_ready", JSON.stringify({
  backend: config.databaseUrl ? "postgres" : "json"
}));

const maxCarousels = Number(process.env.CAROUSEL_MAX_PER_BATCH || 1);
console.log("carousel_local_start", JSON.stringify({ maxCarousels }));

try {
  const result = await runCarouselAgent(db, config, maxCarousels);
  console.log("carousel_local_done", JSON.stringify(result));
} catch (err) {
  console.error("carousel_local_error", JSON.stringify({ error: err.message, stack: err.stack }));
  process.exit(1);
}
