import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createAnalyticsReport, runPublishPipeline, runScrapePipeline } from "./agents.js";
import { loadConfig } from "./config.js";
import { JsonDb } from "./db.js";
import { startDiscoveryScheduler } from "./discovery-scheduler.js";
import { createApp } from "./server.js";

await loadEnvFile(resolve(".env"));
const config = loadConfig();
const db = new JsonDb(resolve(config.dataFile));
await db.load();
db.state.settings.mode = db.state.settings.mode || config.autoMode;
db.state.settings.autoPublishThreshold = db.state.settings.autoPublishThreshold || config.autoPublishThreshold;
db.state.settings.reviewThreshold = db.state.settings.reviewThreshold || config.reviewThreshold;
await db.save();

const app = createApp({ db, config, publicDir: existsSync(resolve("dist")) ? resolve("dist") : resolve("public") });
app.listen(config.port, config.host, () => {
  console.log(`Affiliate Deal Agents MVP running at ${config.publicBaseUrl}`);
});

startDiscoveryScheduler(db, config);

setInterval(() => {
  runScrapePipeline(db, config).catch((error) => console.error("scrape_failed", error));
}, config.scrapeIntervalMinutes * 60 * 1000);

setInterval(() => {
  runPublishPipeline(db, config).catch((error) => console.error("publish_failed", error));
}, config.publishIntervalMinutes * 60 * 1000);

setInterval(() => {
  createAnalyticsReport(db);
  db.save().catch((error) => console.error("report_save_failed", error));
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
