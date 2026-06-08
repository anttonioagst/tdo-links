import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { PgDb } from "./pg-db.js";
import { JsonDb } from "./db.js";
import { initQueues, getConnection } from "./queues/index.js";
import { startWorkers } from "./queues/workers.js";
import { runDiscovery } from "./agents/discovery.js";
import { runSupervisorCheck } from "./agents/supervisor.js";
import { runOrchestratorCycle } from "./agents/orchestrator.js";
import { runWatchdogCheck } from "./agents/watchdog.js";
import { runDailyInstagramBatch } from "./agents/instagram-agent.js";
import { runCarouselAgent } from "./agents/carousel-agent.js";
import { enqueuePendingTelegramOffers } from "./publication-recovery.js";
import { setupDiscordServer } from "./discord/setup.js";
import cron from "node-cron";

await loadEnvFile(resolve(".env"));
const config = loadConfig();

const db = config.databaseUrl
  ? new PgDb(config.databaseUrl)
  : new JsonDb(resolve(config.dataFile));

await db.load();
console.log("worker_db_ready", JSON.stringify({ backend: config.databaseUrl ? "postgres" : "json" }));

// Provision the Discord channel map on boot so ops logs and public deals can post
// without a manual /api/discord/setup call. Best-effort and idempotent.
if (config.discordBotToken && config.discordGuildId && !Object.keys(db.state.discord?.channels || {}).length) {
  try {
    const result = await setupDiscordServer(db, config);
    console.log("discord_setup_boot", JSON.stringify({ ok: result.ok, channels: Object.keys(result.channels || {}).length, error: result.error || null }));
  } catch (err) {
    console.error("discord_setup_boot_failed", JSON.stringify({ error: err.message }));
  }
}

const queuesReady = initQueues(config.redisUrl);
// The autonomous orchestrator does not need Redis. Only the legacy queue pipeline does.
if (!queuesReady && !config.orchestratorEnabled) {
  console.error("worker_error: REDIS_URL not set — legacy worker requires Redis");
  process.exit(1);
}

// Skip the legacy queue workers when the orchestrator owns the cycle — otherwise
// the legacy recovery loop would race the orchestrator and double-publish.
if (queuesReady && !config.orchestratorEnabled) startWorkers(db, config, getConnection());

// Keep in-memory state fresh so quota checks read current publishLog from PostgreSQL.
// Skip while the orchestrator owns the cycle — it reloads at the start of each cycle
// itself, and a mid-cycle reload would clobber its in-memory mutations.
if (config.databaseUrl && !config.orchestratorEnabled) {
  setInterval(() => {
    db.load().catch((err) => console.error("worker_state_reload_failed", err.message));
  }, 15 * 1000);
}

if (config.orchestratorEnabled) {
  // Single autonomous agent owns the whole cycle: scrape → validate → publish →
  // archive duplicates. Replaces the discovery cron + supervisor + recovery loop.
  const interval = Math.max(1, config.orchestratorIntervalMinutes);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runOrchestratorCycle(db, config);
      console.log("orchestrator_cycle", JSON.stringify(result));
    } catch (err) {
      console.error("orchestrator_cycle_failed", JSON.stringify({ error: err.message }));
    } finally {
      running = false;
    }
  };
  cron.schedule(`*/${interval} * * * *`, tick);
  tick();

  // Watchdog: independent of the orchestrator cycle — checks for prolonged silence
  // and sends a Telegram alert to admin when the bot hasn't posted in > N minutes.
  if (config.watchdogEnabled) {
    const watchdogMs = Math.max(5, config.watchdogIntervalMinutes) * 60 * 1000;
    setInterval(async () => {
      try {
        const result = await runWatchdogCheck(db, config);
        if (result.alertSent || result.silent) {
          console.log("watchdog_check", JSON.stringify(result));
        }
      } catch (err) {
        console.error("watchdog_failed", JSON.stringify({ error: err.message }));
      }
    }, watchdogMs);
    console.log("watchdog_active", JSON.stringify({ intervalMinutes: config.watchdogIntervalMinutes, alertAfterMinutes: config.watchdogAlertAfterMinutes }));
  }

  // Instagram batch — top 2-3 deals of the day at 13h and 20h (UTC-3 = 16h and 23h UTC)
  cron.schedule("0 16,23 * * *", async () => {
    try {
      const maxPosts = Number(process.env.INSTAGRAM_MAX_POSTS_PER_BATCH || 3);
      await runDailyInstagramBatch(db, config, maxPosts);
    } catch (err) {
      console.error("instagram_batch_failed", JSON.stringify({ error: err.message }));
    }
  });

  // Carousel agent — gera carrossel editorial (Higgsfield + template) dos top deals do dia
  // Roda às 14h e 21h UTC (11h e 18h BRT) — após o orchestrator ter publicado as ofertas
  cron.schedule("0 14,21 * * *", async () => {
    try {
      const maxCarousels = Number(process.env.CAROUSEL_MAX_PER_BATCH || 1);
      const result = await runCarouselAgent(db, config, maxCarousels);
      console.log("carousel_agent_cycle", JSON.stringify(result));
    } catch (err) {
      console.error("carousel_agent_failed", JSON.stringify({ error: err.message }));
    }
  });
  console.log("carousel_agent_scheduled", JSON.stringify({ schedule: "0 14,21 * * * (UTC)" }));

  console.log("worker_ready — orquestrador autônomo ativo", JSON.stringify({ intervalMinutes: interval, model: config.orchestratorModel }));
} else {
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
