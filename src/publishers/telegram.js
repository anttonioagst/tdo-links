export async function testTelegram(config) {
  if (config.telegramDryRun || !config.telegramBotToken || !config.telegramChatId) {
    return {
      ok: false,
      dryRun: config.telegramDryRun,
      providerMessageId: null,
      detail: "Teste nao enviado: dry-run ativo ou credenciais ausentes."
    };
  }
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text: "TDO Links: teste de integracao Telegram concluido."
    })
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok && payload.ok === true,
    dryRun: false,
    providerMessageId: payload.result?.message_id || null,
    detail: payload.description || (response.ok ? "ok" : `HTTP ${response.status}`)
  };
}

export async function publishTelegram(draft, config, offer = null) {
  if (config.telegramDryRun || !config.telegramBotToken || !config.telegramChatId) {
    return {
      ok: true,
      dryRun: true,
      providerMessageId: null,
      detail: "Telegram dry-run ativo ou credenciais ausentes."
    };
  }

  const images = offerImages(offer);
  if (images.length > 1) {
    const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMediaGroup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        media: images.map((image, index) => ({
          type: "photo",
          media: image,
          ...(index === 0 ? { caption: draft.text } : {})
        }))
      })
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok && payload.ok,
      dryRun: false,
      providerMessageId: payload.result?.[0]?.message_id || null,
      detail: payload.description || "ok"
    };
  }

  const hasImage = images.length === 1;
  const method = hasImage ? "sendPhoto" : "sendMessage";
  const body = hasImage ? {
    chat_id: config.telegramChatId,
    photo: images[0],
    caption: draft.text
  } : {
    chat_id: config.telegramChatId,
    text: draft.text,
    disable_web_page_preview: false
  };

  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok && payload.ok,
    dryRun: false,
    providerMessageId: payload.result?.message_id || null,
    detail: payload.description || "ok"
  };
}

function offerImages(offer) {
  return [...new Set([...(offer?.imageUrls || []), offer?.imageUrl].filter((url) => /^https?:\/\//.test(url || "")))].slice(0, 4);
}
