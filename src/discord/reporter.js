import { createDiscordClient } from "./client.js";

const AGENT_CHANNELS = {
  supervisor: "supervisor",
  discovery: "descoberta",
  validation: "filtro",
  filter: "filtro",
  creative: "copy",
  copywriter: "copy",
  image: "imagem",
  publisher: "publicador",
  growth: "growth"
};

const SECRET_KEY_PATTERN = /(token|secret|key|authorization|password)/i;

export async function reportAgentEvent(db, config, event, options = {}) {
  if (!config.discordOpsEnabled) return { ok: true, skipped: true, reason: "discord_ops_disabled" };
  const channelName = event.channel || AGENT_CHANNELS[event.agent] || "painel-executivo";
  const channelId = db.state.discord?.channels?.[channelName];
  if (!channelId) return { ok: false, skipped: true, reason: "discord_channel_missing", channel: channelName };

  try {
    const client = options.client || createDiscordClient(config, options);
    await client.createMessage(channelId, buildAgentEventMessage(event));
    return { ok: true, channel: channelName };
  } catch (error) {
    return { ok: false, channel: channelName, error: error?.message || String(error) };
  }
}

export function buildAgentEventMessage(event) {
  const severity = event.severity || "info";
  const color = severity === "critical" ? 0xef4444 : severity === "warning" ? 0xf59e0b : 0x22c55e;
  const data = sanitize(event.data || {});
  const fields = Object.entries(data).slice(0, 8).map(([name, value]) => ({
    name,
    value: String(value).slice(0, 900),
    inline: true
  }));
  return {
    embeds: [{
      title: `${labelForSeverity(severity)} ${event.title || event.agent || "Agente"}`,
      description: sanitizeText(event.message || ""),
      color,
      fields,
      footer: { text: `agent:${event.agent || "unknown"}` },
      timestamp: new Date().toISOString()
    }]
  };
}

function labelForSeverity(severity) {
  if (severity === "critical") return "🚨";
  if (severity === "warning") return "⚠️";
  return "✅";
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return sanitizeText(value);
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    SECRET_KEY_PATTERN.test(key) ? "[redacted]" : sanitize(nested)
  ]));
}

function sanitizeText(value) {
  return String(value ?? "").replace(/(token|secret|authorization|password)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}
