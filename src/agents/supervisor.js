import { hasRealPromotion } from "../deals.js";
import { normalizeOfferTitle, offerIdentityKeys } from "../publication-dedupe.js";
import { enqueuePendingTelegramOffers } from "../publication-recovery.js";
import { reportAgentEvent } from "../discord/reporter.js";

export async function runSupervisorCheck(db, config, options = {}) {
  if (config.supervisorEnabled === false) return { ok: true, skipped: true, reason: "supervisor_disabled", incidents: [], actions: [] };
  if (db.load) await db.load();
  if (!Array.isArray(db.state.incidents)) db.state.incidents = [];

  const now = options.now || new Date();
  const incidents = [];
  const actions = [];

  const duplicateIncident = detectDuplicateReadyOffers(db.state, now);
  if (duplicateIncident) incidents.push(upsertIncident(db.state, duplicateIncident, now));

  if (isTelegramStale(db.state.publishLog || [], config, now)) {
    const incident = upsertIncident(db.state, {
      type: "telegram_stale_window",
      severity: "warning",
      title: "Janela longa sem posts no Telegram",
      detail: `Sem publishLog ok:true no Telegram ha ${config.supervisorStaleTelegramMinutes || 90} minutos ou mais.`,
      action: "recovery_requested"
    }, now);
    incidents.push(incident);

    if (options.creativeQueue) {
      const recovery = await enqueuePendingTelegramOffers(db, config, options.creativeQueue);
      if (recovery.enqueued > 0) {
        actions.push({ type: "recovery_enqueued_one_offer", enqueued: recovery.enqueued });
        incident.action = "recovery_enqueued_one_offer";
      } else {
        actions.push({ type: "recovery_skipped", reason: recovery.reason, waitMinutes: recovery.waitMinutes });
      }
    }
  }

  resolveTelegramStaleIncidents(db.state, now);
  if (db.save) await db.save();

  for (const incident of incidents) {
    await safeReport(db, config, {
      agent: "supervisor",
      severity: incident.severity,
      title: incident.title,
      message: incident.detail,
      data: { incidentId: incident.id, type: incident.type, action: incident.action || "" }
    });
  }

  return { ok: true, incidents, actions };
}

function isTelegramStale(publishLog, config, now) {
  const minutes = Number(config.supervisorStaleTelegramMinutes || 90);
  const lastOk = publishLog
    .filter((entry) => entry.channel === "telegram" && entry.result?.ok === true)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (!lastOk) return true;
  return now.getTime() - new Date(lastOk.createdAt).getTime() >= minutes * 60 * 1000;
}

function detectDuplicateReadyOffers(state, now) {
  const seen = new Map();
  const duplicateIds = [];
  for (const offer of state.offers || []) {
    if (offer.status !== "auto_ready" || !hasRealPromotion(offer)) continue;
    const keys = offerIdentityKeys(offer);
    const titleKey = normalizeOfferTitle(offer.title);
    if (titleKey.length >= 12) keys.push(`ready-title:${titleKey}`);
    for (const key of keys) {
      if (seen.has(key)) {
        duplicateIds.push(offer.id, seen.get(key));
      } else {
        seen.set(key, offer.id);
      }
    }
  }
  const relatedOfferIds = [...new Set(duplicateIds)].filter(Boolean);
  if (!relatedOfferIds.length) return null;
  return {
    type: "duplicate_ready_offer",
    severity: "warning",
    title: "Ofertas duplicadas prontas para publicacao",
    detail: `Supervisor encontrou ${relatedOfferIds.length} ofertas auto_ready com identidade repetida.`,
    action: "duplicate_block_recommended",
    relatedOfferIds,
    metadata: { detectedAt: now.toISOString() }
  };
}

function upsertIncident(state, incident, now) {
  const existing = state.incidents.find((item) => item.type === incident.type && item.status !== "resolved");
  if (existing) {
    Object.assign(existing, incident, { updatedAt: now.toISOString() });
    return existing;
  }
  const created = {
    id: `incident_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    status: "open",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    resolvedAt: null,
    relatedOfferIds: [],
    metadata: {},
    ...incident
  };
  state.incidents.unshift(created);
  return created;
}

function resolveTelegramStaleIncidents(state, now) {
  const latestOk = (state.publishLog || []).find((entry) => entry.channel === "telegram" && entry.result?.ok === true);
  if (!latestOk) return;
  for (const incident of state.incidents || []) {
    if (incident.type !== "telegram_stale_window" || incident.status === "resolved") continue;
    if (new Date(latestOk.createdAt) >= new Date(incident.createdAt)) {
      incident.status = "resolved";
      incident.resolvedAt = now.toISOString();
      incident.updatedAt = now.toISOString();
    }
  }
}

async function safeReport(db, config, event) {
  try {
    await reportAgentEvent(db, config, event);
  } catch {
    // Supervisor reporting cannot block corrective actions.
  }
}
