import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { PgDb } from "./pg-db.js";
import { JsonDb } from "./db.js";
import { initQueues, getConnection } from "./queues/index.js";
import { startWorkers } from "./queues/workers.js";
import { runDiscovery } from "./agents/discovery.js";
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

cron.schedule("0 */2 * * *", async () => {
  console.log("cron_trigger discovery");
  runDiscovery(db, config).catch(err =>
    console.error("cron_discovery_failed", JSON.stringify({ error: err.message }))
  );
});

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
