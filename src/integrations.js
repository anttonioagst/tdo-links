export function buildDiagnostics({ config, state }) {
  const lastTelegramAttempt = (state.publishLog || []).find((item) => item.channel === "telegram") || null;
  const missing = [];
  if (!config.telegramBotToken) missing.push("bot_token");
  if (!config.telegramChatId) missing.push("chat_id");
  return {
    publicBaseUrl: config.publicBaseUrl,
    generatedAt: new Date().toISOString(),
    telegram: {
      dryRun: config.telegramDryRun,
      hasBotToken: Boolean(config.telegramBotToken),
      hasChatId: Boolean(config.telegramChatId),
      credentialsReady: missing.length === 0,
      ready: missing.length === 0 && config.telegramDryRun === false,
      missing,
      lastAttempt: lastTelegramAttempt
    },
    x: {
      dryRun: config.xDryRun,
      profileUrl: config.xProfileUrl || "",
      ready: Boolean(config.xProfileUrl)
    },
    amazon: {
      hasDefaultTag: Boolean(config.amazonAffiliateTag),
      hasTelegramTag: Boolean(config.amazonAffiliateTagTelegram),
      hasXTag: Boolean(config.amazonAffiliateTagX),
      hasAdminTag: Boolean(config.amazonAffiliateTagAdmin),
      creatorUrl: config.amazonCreatorUrl || "",
      searchUrls: config.amazonSearchUrls || []
    },
    automation: {
      autoMode: config.autoMode,
      autoPublishThreshold: config.autoPublishThreshold,
      reviewThreshold: config.reviewThreshold,
      scrapeIntervalMinutes: config.scrapeIntervalMinutes,
      publishIntervalMinutes: config.publishIntervalMinutes
    },
    scout: {
      scraperMode: config.scraperMode,
      scraperFallbackMock: config.scraperFallbackMock
    }
  };
}

export function summarizeTelegramTest(config) {
  const missing = [];
  if (!config.telegramBotToken) missing.push("bot_token");
  if (!config.telegramChatId) missing.push("chat_id");
  if (config.telegramDryRun) missing.push("dry_run_enabled");
  return {
    ok: missing.length === 0,
    dryRun: config.telegramDryRun,
    missing,
    detail: missing.length
      ? `Telegram nao esta pronto: ${missing.join(", ")}.`
      : "Telegram configurado para envio real."
  };
}
