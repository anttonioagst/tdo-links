// Watchdog — detects prolonged Telegram silence, tries to recover automatically,
// and only alerts admin if recovery also fails.

import { runOrchestratorCycle } from "./orchestrator.js";

const RECOVERY_COOLDOWN_MS = 30 * 60 * 1000;  // attempt recovery at most every 30 min
const ALERT_COOLDOWN_MS    = 60 * 60 * 1000;  // re-alert at most every hour

let lastRecoveryAt = null;
let lastAlertSentAt = null;

export async function runWatchdogCheck(db, config) {
  if (!config.watchdogEnabled) return { ok: true, skipped: true };

  if (db.load) await db.load();

  const now = Date.now();
  const thresholdMs = config.watchdogAlertAfterMinutes * 60 * 1000;
  const publishLog = db.state.publishLog || [];

  const lastOk = publishLog
    .filter(e => e.channel === "telegram" && e.result?.ok === true)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  const silenceMs = lastOk ? now - new Date(lastOk.createdAt).getTime() : Infinity;
  const silenceMinutes = Math.round(silenceMs / 60000);

  if (silenceMs < thresholdMs) {
    lastRecoveryAt = null;
    lastAlertSentAt = null;
    return { ok: true, silent: false, silenceMinutes };
  }

  // --- STEP 1: try to recover automatically ---
  let recovered = false;

  if (!lastRecoveryAt || now - lastRecoveryAt > RECOVERY_COOLDOWN_MS) {
    lastRecoveryAt = now;
    console.log("watchdog_recovery_start", JSON.stringify({ silenceMinutes }));

    try {
      // Force the orchestrator to run a full cycle right now.
      // scrapeDeals already falls back to Pelando/Promobit when Amazon is blocked.
      const result = await runOrchestratorCycle(db, config);
      console.log("watchdog_recovery_result", JSON.stringify({ published: result.published, ok: result.ok }));
      recovered = result.published > 0;
    } catch (err) {
      console.log("watchdog_recovery_error", JSON.stringify({ error: err.message }));
    }
  }

  if (recovered) return { ok: true, silent: false, recovered: true, silenceMinutes };

  // --- STEP 2: recovery failed — alert admin ---
  // Only alert if an explicit admin chat is configured — never fall back to the public channel.
  if (!config.telegramBotToken || !config.telegramAdminChatId) {
    console.log("watchdog_alert_skipped", JSON.stringify({ reason: "TELEGRAM_ADMIN_CHAT_ID_not_set", silenceMinutes }));
    return { ok: true, silent: true, silenceMinutes, alertSkipped: "TELEGRAM_ADMIN_CHAT_ID not configured" };
  }

  if (lastAlertSentAt && now - lastAlertSentAt < ALERT_COOLDOWN_MS) {
    return { ok: true, silent: true, silenceMinutes, alertSkipped: "cooldown" };
  }

  const offers = db.state.offers || [];
  const ready   = offers.filter(o => o.status === "auto_ready").length;
  const pending = offers.filter(o => o.status === "new" || o.status === "queued").length;

  const hoursAgo = silenceMinutes >= 60
    ? `${Math.floor(silenceMinutes / 60)}h${silenceMinutes % 60 > 0 ? `${silenceMinutes % 60}min` : ""}`
    : `${silenceMinutes}min`;

  const statusLine = ready > 0
    ? `📦 ${ready} oferta(s) pronta(s) mas não conseguiu publicar`
    : pending > 0
      ? `🔄 ${pending} oferta(s) aguardando validação — nenhuma aprovada`
      : `❌ Fila vazia — Amazon bloqueado e feeds sem novos deals`;

  const text = [
    `🚨 <b>TDO Links — Intervenção manual necessária</b>`,
    "",
    `Bot silencioso há <b>${hoursAgo}</b>. Tentei recuperar automaticamente mas não consegui publicar.`,
    "",
    statusLine,
    "",
    `Verifique os logs no Railway para diagnóstico.`
  ].join("\n");

  try {
    const botUrl = `https://api.telegram.org/bot${config.telegramBotToken}`;
    const res = await fetch(`${botUrl}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.telegramAdminChatId, text, parse_mode: "HTML" })
    });
    const payload = await res.json().catch(() => ({}));
    if (res.ok && payload.ok) {
      lastAlertSentAt = now;
      console.log("watchdog_alert_sent", JSON.stringify({ silenceMinutes, ready, pending }));
    } else {
      console.log("watchdog_alert_failed", JSON.stringify({ detail: payload.description }));
    }
    return { ok: true, silent: true, silenceMinutes, alertSent: res.ok && payload.ok };
  } catch (err) {
    console.log("watchdog_alert_error", JSON.stringify({ error: err.message }));
    return { ok: false, silent: true, silenceMinutes };
  }
}
