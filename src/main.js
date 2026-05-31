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

const queuesReady = initQueues(config.redisUrl);
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

// Autonomous pipeline — only runs when there is no dedicated worker service (no Redis).
// When Redis is present, the worker-main.js cron handles discovery and recovery.
if (!queuesReady) {
  const scrapeMs = Math.max(5, config.scrapeIntervalMinutes) * 60 * 1000;
  const publishMs = Math.max(1, config.publishIntervalMinutes) * 60 * 1000;

  async function runScrapeLoop() {
    try {
      if (db.load) await db.load();
      if (config.anthropicApiKey) {
        const { runDiscovery } = await import("./agents/discovery.js");
        const result = await runDiscovery(db, config);
        console.log("server_scrape_loop", JSON.stringify({ mode: "agent", ...result }));
      } else {
        const { runScrapePipeline } = await import("./agents.js");
        const result = await runScrapePipeline(db, config);
        console.log("server_scrape_loop", JSON.stringify({ mode: "legacy", ...result }));
      }
    } catch (err) {
      console.error("server_scrape_loop_failed", JSON.stringify({ error: err.message }));
    }
  }

  async function runPublishLoop() {
    try {
      if (db.load) await db.load();
      const { runPublishPipeline } = await import("./agents.js");
      const result = await runPublishPipeline(db, config);
      console.log("server_publish_loop", JSON.stringify(result));
    } catch (err) {
      console.error("server_publish_loop_failed", JSON.stringify({ error: err.message }));
    }
  }

  // Start immediately, then on schedule
  setTimeout(runScrapeLoop, 10_000);
  setInterval(runScrapeLoop, scrapeMs);
  setTimeout(runPublishLoop, 30_000);
  setInterval(runPublishLoop, publishMs);

  console.log("server_autonomous_loop_started", JSON.stringify({ scrapeIntervalMinutes: config.scrapeIntervalMinutes, publishIntervalMinutes: config.publishIntervalMinutes }));
}

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
