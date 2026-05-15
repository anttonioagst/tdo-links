const CATEGORY_COLORS = {
  SSD: 0x22c55e,
  notebook: 0x6366f1,
  periférico: 0x8b5cf6,
  monitor: 0x0ea5e9,
  headset: 0xf59e0b,
  default: 0x64748b
};

function embedColor(offer) {
  return CATEGORY_COLORS[offer?.category] ?? CATEGORY_COLORS.default;
}

function buildEmbed(draft, offer) {
  const title = offer?.title || draft.text.split("\n")[0] || "Nova oferta";
  const current = offer?.currentPrice ? `R$ ${Number(offer.currentPrice).toFixed(2).replace(".", ",")}` : "";
  const previous = offer?.previousPrice ? `R$ ${Number(offer.previousPrice).toFixed(2).replace(".", ",")}` : "";
  const discount = offer?.discountPercent ? ` (-${Math.round(offer.discountPercent)}%)` : "";
  const priceLine = previous
    ? `~~${previous}~~ → **${current}**${discount}`
    : current;
  const fields = [];
  if (offer?.rating) fields.push({ name: "⭐ Avaliação", value: `${offer.rating}${offer.reviewCount ? ` (${offer.reviewCount})` : ""}`, inline: true });
  if (offer?.store) fields.push({ name: "📦 Loja", value: offer.store, inline: true });
  return {
    title: `🏷️ ${title}`,
    description: priceLine || draft.text.slice(0, 200),
    color: embedColor(offer),
    fields,
    url: offer?.affiliateUrl || offer?.url || undefined,
    footer: { text: "Link de afiliado: posso receber comissão pela compra." },
    timestamp: new Date().toISOString()
  };
}

export async function publishDiscord(draft, config, offer = null) {
  if (config.discordDryRun || !config.discordWebhookUrl) {
    return {
      ok: true,
      dryRun: true,
      providerMessageId: null,
      detail: config.discordDryRun ? "Discord dry-run ativo." : "DISCORD_WEBHOOK_URL não configurado."
    };
  }
  try {
    const body = { embeds: [buildEmbed(draft, offer)] };
    const response = await fetch(config.discordWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (response.status === 204) {
      return { ok: true, dryRun: false, providerMessageId: null, detail: "ok" };
    }
    const payload = await response.json().catch(() => ({}));
    return {
      ok: false,
      dryRun: false,
      providerMessageId: null,
      detail: payload.message || `HTTP ${response.status}`
    };
  } catch (error) {
    return { ok: false, dryRun: false, providerMessageId: null, detail: `Discord error: ${error?.message || String(error)}` };
  }
}

export async function testDiscord(config) {
  if (!config.discordWebhookUrl) {
    return { ok: false, dryRun: false, providerMessageId: null, detail: "DISCORD_WEBHOOK_URL não configurado." };
  }
  if (config.discordDryRun) {
    return { ok: false, dryRun: true, providerMessageId: null, detail: "Discord dry-run ativo." };
  }
  try {
    const response = await fetch(config.discordWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "TDO Links: teste de integração Discord concluído. ✅" })
    });
    return {
      ok: response.status === 204,
      dryRun: false,
      providerMessageId: null,
      detail: response.status === 204 ? "ok" : `HTTP ${response.status}`
    };
  } catch (error) {
    return { ok: false, dryRun: false, providerMessageId: null, detail: `Discord error: ${error?.message || String(error)}` };
  }
}
