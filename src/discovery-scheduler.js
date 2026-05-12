import { runAmazonDiscovery } from "./discovery.js";

let running = false;

export function shouldRunAmazonDiscovery(settings, now = new Date()) {
  if (settings?.enabled === false) return false;
  if (!settings?.nextRunAt) return true;
  const dueAt = new Date(settings.nextRunAt);
  if (Number.isNaN(dueAt.getTime())) return true;
  return dueAt.getTime() <= now.getTime();
}

export async function runDiscoverySchedulerTick(db, config, options = {}) {
  const now = options.now || new Date();
  const settings = db.state.discovery?.amazon || {};
  if (!shouldRunAmazonDiscovery(settings, now)) return { ran: false, reason: "not_due" };
  if (running) return { ran: false, reason: "already_running" };
  running = true;
  try {
    const runDiscovery = options.runDiscovery || ((database, appConfig) => runAmazonDiscovery(database, appConfig, { trigger: "scheduled" }));
    const result = await runDiscovery(db, config);
    return { ran: true, result };
  } finally {
    running = false;
  }
}

export function startDiscoveryScheduler(db, config, options = {}) {
  const intervalMs = options.intervalMs || 60 * 1000;
  const timer = setInterval(() => {
    runDiscoverySchedulerTick(db, config).catch((error) => console.error("discovery_failed", error));
  }, intervalMs);
  runDiscoverySchedulerTick(db, config).catch((error) => console.error("discovery_failed", error));
  return timer;
}
