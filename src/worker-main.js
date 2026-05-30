import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { PgDb } from "./pg-db.js";
import { JsonDb } from "./db.js";
import { initQueues, getConnection } from "./queues/index.js";
import { startWorkers } from "./queues/workers.js";
import { runDiscovery } from "./agents/discovery.js";
import { runSupervisorCheck } from "./agents/supervisor.js";
import { enqueuePendingTelegramOffers } from "./publication-recovery.js";
import cron from "node-cron";

await loadEnvFile(resolve(".env"));
const config = loadConfig();

const db = config.databaseUrl
  ? new PgDb(config.databaseUrl)
  : new JsonDb(resolve(config.dataFile));

await db.load();
console.log("worker_db_ready", JSON.stringify({ backend: config.databaseUrl ? "postgres" : "json" }));

const queuesReady = initQueues(config.redisUrl);
if (!queuesReady) {
  console.error("worker_error: REDIS_URL not set — worker requires Redis");
  process.exit(1);
}

startWorkers(db, config, getConnection());

// Keep in-memory state fresh so quota checks read current publishLog from PostgreSQL
if (config.databaseUrl) {
  setInterval(() => {
    db.load().catch((err) => console.error("worker_state_reload_failed", err.message));
  }, 15 * 1000);
}

cron.schedule("*/15 * * * *", async () => {
  console.log("cron_trigger discovery");
  try {
    await runDiscovery(db, config);
    const { creativeQueue } = await import("./queues/index.js");
    const recovery = await enqueuePendingTelegramOffers(db, config, creativeQueue);
    console.log("cron_publication_recovery", JSON.stringify(recovery));
  } catch (err) {
    console.error("cron_discovery_failed", JSON.stringify({ error: err.message }));
  }
});

if (config.supervisorEnabled) {
  const supervisorMs = Math.max(1, config.supervisorIntervalMinutes) * 60 * 1000;
  setInterval(async () => {
    try {
      const { creativeQueue } = await import("./queues/index.js");
      const result = await runSupervisorCheck(db, config, { creativeQueue });
      if (result.incidents?.length || result.actions?.length) {
        console.log("supervisor_check", JSON.stringify(result));
      }
    } catch (err) {
      console.error("supervisor_check_failed", JSON.stringify({ error: err.message }));
    }
  }, supervisorMs);
}

console.log("worker_ready — aguardando jobs");

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
