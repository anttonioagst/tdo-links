export function telegramPublicationStatus(publishLog = [], config = {}, now = new Date()) {
  const maxPerCycle = Number(config.maxPublicationsPerCycle ?? 4);
  const windowHours = Number(config.publicationWindowHours ?? 1);
  const minIntervalMinutes = Number(config.minPublicationIntervalMinutes ?? 15);
  const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const successful = publishLog
    .filter((entry) => entry.result?.ok && entry.channel === "telegram" && new Date(entry.createdAt) >= windowStart)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const lastPublishedAt = successful[0]?.createdAt ? new Date(successful[0].createdAt) : null;
  const waitMinutes = lastPublishedAt
    ? Math.max(0, Math.ceil((lastPublishedAt.getTime() + minIntervalMinutes * 60 * 1000 - now.getTime()) / 60000))
    : 0;
  const base = {
    recentPublished: successful.length,
    maxPerCycle,
    windowHours,
    minIntervalMinutes,
    waitMinutes
  };
  if (successful.length >= maxPerCycle) {
    return { allowed: false, reason: "telegram_quota_reached", ...base };
  }
  if (waitMinutes > 0) {
    return { allowed: false, reason: "telegram_interval_wait", ...base };
  }
  return { allowed: true, reason: "allowed", ...base };
}
