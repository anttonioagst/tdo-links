// Watchdog — runs alongside the orchestrator to detect prolonged silence and alert admin via Telegram.
// Sends one alert when silence crosses the threshold, then stays quiet until the bot posts again.

const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // re-alert at most once per hour after first trigger

let lastAlertSentAt = null;

export async function runWatchdogCheck(db, config) {
  if (!config.watchdogEnabled) return { ok: true, skipped: true };
  if (!config.telegramBotToken || !config.telegramAdminChatId) return { ok: true, skipped: true, reason: "no_telegram_credentials" };

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
    // Bot is posting normally — reset alert state
    lastAlertSentAt = null;
    return { ok: true, silent: false, silenceMinutes };
  }

  // Already alerted recently — don't spam
  if (lastAlertSentAt && now - lastAlertSentAt < ALERT_COOLDOWN_MS) {
    return { ok: true, silent: true, silenceMinutes, alertSkipped: "cooldown" };
  }

  // Count current queue state
  const offers = db.state.offers || [];
  const ready = offers.filter(o => o.status === "auto_ready").length;
  const pending = offers.filter(o => o.status === "new" || o.status === "queued").length;

  const hoursAgo = silenceMinutes >= 60
    ? `${Math.floor(silenceMinutes / 60)}h${silenceMinutes % 60 > 0 ? `${silenceMinutes % 60}m` : ""}`
    : `${silenceMinutes}min`;

  const queueLine = ready > 0
    ? `📦 ${ready} oferta(s) pronta(s) na fila`
    : pending > 0
      ? `🔄 ${pending} oferta(s) aguardando validação`
      : `❌ Fila vazia — Amazon bloqueando scraping`;

  const text = [
    `🚨 <b>TDO Links — Bot silencioso há ${hoursAgo}</b>`,
    "",
    `Nenhum post no Telegram desde ${lastOk ? new Date(lastOk.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "sempre"}.`,
    "",
    queueLine,
    "",
    `O sistema está tentando recuperar automaticamente via feeds alternativos (Pelando/Promobit).`,
    `Se o problema persistir, verifique os logs no Railway.`
  ].join("\n");

  try {
    const botUrl = `https://api.telegram.org/bot${config.telegramBotToken}`;
    const response = await fetch(`${botUrl}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegramAdminChatId,
        text,
        parse_mode: "HTML"
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok) {
      lastAlertSentAt = now;
      console.log("watchdog_alert_sent", JSON.stringify({ silenceMinutes, ready, pending }));
      return { ok: true, silent: true, silenceMinutes, alertSent: true };
    }
    console.log("watchdog_alert_failed", JSON.stringify({ detail: payload.description }));
    return { ok: false, silent: true, silenceMinutes, alertSent: false };
  } catch (err) {
    console.log("watchdog_alert_error", JSON.stringify({ error: err.message }));
    return { ok: false, silent: true, silenceMinutes, error: err.message };
  }
}
