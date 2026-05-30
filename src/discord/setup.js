import { createDiscordClient } from "./client.js";

const CHANNEL_TYPE_TEXT = 0;
const CHANNEL_TYPE_CATEGORY = 4;

export const DISCORD_STRUCTURE = [
  {
    name: "📌 INICIO",
    private: false,
    channels: ["boas-vindas", "como-funciona", "avisos"]
  },
  {
    name: "🔥 PROMOCOES",
    private: false,
    channels: ["ofertas-do-dia", "setup-gamer", "notebooks", "monitores", "tvs", "audio-headsets", "cadeiras-mesas", "expiradas"]
  },
  {
    name: "🔒 TDO OPS",
    private: true,
    channels: ["painel-executivo", "incidentes", "supervisor", "descoberta", "filtro", "copy", "imagem", "publicador", "growth", "relatorios"]
  }
];

export async function setupDiscordServer(db, config, options = {}) {
  if (!config.discordGuildId) {
    return recordSetupError(db, "DISCORD_GUILD_ID not configured");
  }
  const client = options.client || createDiscordClient(config, options);
  try {
    const existing = await client.listGuildChannels(config.discordGuildId);
    const channelsByName = new Map(existing.map((channel) => [channel.name, channel]));
    if (!db.state.discord) db.state.discord = { channels: {}, roles: {}, lastSetupAt: null, lastSetupError: null };
    if (!db.state.discord.channels) db.state.discord.channels = {};
    if (!db.state.discord.roles) db.state.discord.roles = {};

    for (const category of DISCORD_STRUCTURE) {
      const categoryChannel = await ensureChannel(client, config.discordGuildId, channelsByName, {
        name: category.name,
        type: CHANNEL_TYPE_CATEGORY,
        permission_overwrites: category.private ? privateCategoryOverwrites(config.discordGuildId) : []
      });
      db.state.discord.channels[category.name] = categoryChannel.id;

      for (const channelName of category.channels) {
        const channel = await ensureChannel(client, config.discordGuildId, channelsByName, {
          name: channelName,
          type: CHANNEL_TYPE_TEXT,
          parent_id: categoryChannel.id,
          topic: topicFor(channelName),
          permission_overwrites: category.private ? privateCategoryOverwrites(config.discordGuildId) : readOnlyPublicOverwrites(config.discordGuildId)
        });
        db.state.discord.channels[channelName] = channel.id;
      }
    }

    db.state.discord.lastSetupAt = new Date().toISOString();
    db.state.discord.lastSetupError = null;
    if (db.save) await db.save();
    return { ok: true, channels: db.state.discord.channels };
  } catch (error) {
    return recordSetupError(db, error?.message || String(error));
  }
}

async function ensureChannel(client, guildId, channelsByName, body) {
  const existing = channelsByName.get(body.name);
  if (existing) return existing;
  const created = await client.createGuildChannel(guildId, body);
  channelsByName.set(created.name, created);
  return created;
}

function privateCategoryOverwrites(guildId) {
  return [
    {
      id: guildId,
      type: 0,
      deny: "1024"
    }
  ];
}

function readOnlyPublicOverwrites(guildId) {
  return [
    {
      id: guildId,
      type: 0,
      allow: "1024",
      deny: "2048"
    }
  ];
}

function topicFor(channelName) {
  const topics = {
    "boas-vindas": "Entrada oficial do TDO Links.",
    "como-funciona": "Como comprar pelas ofertas e entender links de afiliado.",
    avisos: "Avisos importantes do TDO Links.",
    "ofertas-do-dia": "Melhores ofertas selecionadas do dia.",
    "setup-gamer": "Perifericos e itens para setup gamer.",
    notebooks: "Promocoes de notebooks.",
    monitores: "Promocoes de monitores.",
    tvs: "Promocoes de TVs.",
    "audio-headsets": "Fones, headsets, caixas de som e soundbars.",
    "cadeiras-mesas": "Cadeiras, mesas e setup fisico.",
    expiradas: "Ofertas encerradas ou fora do radar.",
    "painel-executivo": "Resumo operacional privado.",
    incidentes: "Incidentes detectados pelo supervisor.",
    supervisor: "Logs do agente supervisor.",
    descoberta: "Logs do agente de descoberta.",
    filtro: "Logs do agente de filtro.",
    copy: "Logs do agente de copy.",
    imagem: "Logs do agente de imagem.",
    publicador: "Logs do agente publicador.",
    growth: "Logs do agente de growth.",
    relatorios: "Relatorios automaticos."
  };
  return topics[channelName] || "Canal gerenciado pelo TDO Links Bot.";
}

async function recordSetupError(db, message) {
  if (!db.state.discord) db.state.discord = { channels: {}, roles: {}, lastSetupAt: null, lastSetupError: null };
  db.state.discord.lastSetupError = message;
  if (db.save) await db.save();
  return { ok: false, error: message };
}
