const API_BASE = "https://discord.com/api/v10";

export function createDiscordClient(config, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const token = config.discordBotToken;
  if (!token) throw new Error("DISCORD_BOT_TOKEN not configured");

  async function request(method, path, body) {
    const response = await fetchImpl(`${API_BASE}${path}`, {
      method,
      headers: {
        authorization: `Bot ${token}`,
        "content-type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(payload?.message || `Discord HTTP ${response.status}`);
    }
    return payload;
  }

  return {
    listGuildChannels: (guildId) => request("GET", `/guilds/${guildId}/channels`),
    createGuildChannel: (guildId, body) => request("POST", `/guilds/${guildId}/channels`, body),
    editChannel: (channelId, body) => request("PATCH", `/channels/${channelId}`, body),
    createMessage: (channelId, body) => request("POST", `/channels/${channelId}/messages`, body)
  };
}
