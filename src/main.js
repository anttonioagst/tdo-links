import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { JsonDb } from "./db.js";
import { PgDb } from "./pg-db.js";
import { initQueues } from "./queues/index.js";
import { createApp } from "./server.js";

await loadEnvFile(resolve(".env"));
const config = loadConfig();
const db = config.databaseUrl
  ? new PgDb(config.databaseUrl)
  : new JsonDb(resolve(config.dataFile));
await db.load();
console.log("db_ready", JSON.stringify({ backend: config.databaseUrl ? "postgres" : "json" }));

initQueues(config.redisUrl);
db.state.settings.mode = db.state.settings.mode || config.autoMode;
db.state.settings.autoPublishThreshold = db.state.settings.autoPublishThreshold || config.autoPublishThreshold;
db.state.settings.reviewThreshold = db.state.settings.reviewThreshold || config.reviewThreshold;
await db.save();

const app = createApp({ db, config, publicDir: existsSync(resolve("dist")) ? resolve("dist") : resolve("public") });
app.listen(config.port, config.host, () => {
  console.log(`TDO Links running at ${config.publicBaseUrl}`);
});

// Keep in-memory state fresh when worker writes to PostgreSQL
if (config.databaseUrl) {
  setInterval(() => {
    db.load().catch((err) => console.error("state_reload_failed", err.message));
  }, 15 * 1000);
}

setInterval(() => {
  db.save().catch((error) => console.error("analytics_save_failed", error));
}, 24 * 60 * 60 * 1000);

async function loadEnvFile(filePath) {
  try {
    const { readFile } = await import("node:fs/promises");
    const lines = (await readFile(filePath, "utf8")).split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
