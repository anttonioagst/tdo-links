export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 4318),
    host: env.HOST || "0.0.0.0",
    dataFile: env.DATA_FILE || "data/db.json",
    publicBaseUrl: trimSlash(env.PUBLIC_BASE_URL || `http://localhost:${env.PORT || 4318}`),
    autoMode: env.AUTO_MODE || "limited",
    autoPublishThreshold: Number(env.AUTO_PUBLISH_THRESHOLD || 85),
    reviewThreshold: Number(env.REVIEW_THRESHOLD || 70),
    scrapeIntervalMinutes: Number(env.SCRAPE_INTERVAL_MINUTES || 60),
    publishIntervalMinutes: Number(env.PUBLISH_INTERVAL_MINUTES || 10),
    scraperMode: env.SCRAPER_MODE || "mock",
    scraperFallbackMock: env.SCRAPER_FALLBACK_MOCK !== "false",
    amazonSearchUrls: parseList(env.AMAZON_SEARCH_URLS || [
      "https://www.amazon.com.br/s?k=ssd+nvme",
      "https://www.amazon.com.br/s?k=mouse+gamer+sem+fio",
      "https://www.amazon.com.br/s?k=hub+usb+c"
    ].join(",")),
    disclosure: env.AFFILIATE_DISCLOSURE || "Link de afiliado: posso receber comissao pela compra.",
    amazonAffiliateTag: env.AMAZON_AFFILIATE_TAG || "",
    amazonAffiliateTagTelegram: env.AMAZON_AFFILIATE_TAG_TELEGRAM || "",
    amazonAffiliateTagX: env.AMAZON_AFFILIATE_TAG_X || "",
    amazonAffiliateTagAdmin: env.AMAZON_AFFILIATE_TAG_ADMIN || "",
    amazonCreatorUrl: env.AMAZON_CREATOR_URL || "",
    mercadoLivreAffiliateParam: env.MERCADO_LIVRE_AFFILIATE_PARAM || "",
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || "",
    telegramChatId: env.TELEGRAM_CHAT_ID || "",
    telegramDryRun: env.TELEGRAM_DRY_RUN !== "false",
    xDryRun: env.X_DRY_RUN !== "false",
    xProfileUrl: env.X_PROFILE_URL || "",
    adminToken: env.ADMIN_TOKEN || ""
  };
}

function trimSlash(value) {
  return value.replace(/\/+$/, "");
}

function parseList(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
