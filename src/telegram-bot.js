import Anthropic from "@anthropic-ai/sdk";

const ONBOARDING_MESSAGE = (firstName) =>
  `👋 Olá${firstName ? ` ${firstName}` : ""}! Sou o assistente do *TDO Links* — canal de deals de tech premium.\n\n` +
  `Me conta: que tipo de produto você quer receber? Pode ser bem específico.\n\n` +
  `_Exemplos:_\n` +
  `• "teclados mecânicos e mouses gamer"\n` +
  `• "monitores até R$2.000"\n` +
  `• "fones Sony ou JBL com pelo menos 25% de desconto"\n` +
  `• "qualquer coisa de tech em promoção"\n\n` +
  `Basta responder aqui 👇`;

const HELP_MESSAGE =
  `*TDO Links Bot* — seus deals personalizados\n\n` +
  `Comandos:\n` +
  `/start — cadastrar ou reativar alertas\n` +
  `/status — ver suas preferências atuais\n` +
  `/editar — mudar o que você quer receber\n` +
  `/parar — pausar os alertas`;

async function sendMessage(chatId, text, botToken, options = {}) {
  const body = { chat_id: chatId, text, parse_mode: "Markdown", ...options };
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json().catch(() => ({}));
}

async function parsePreferencesWithAI(text, anthropicApiKey) {
  if (!anthropicApiKey) return { categories: [], brands: [], maxPriceBrl: null, minDiscountPct: 15 };
  const client = new Anthropic({ apiKey: anthropicApiKey });
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `Extraia as preferências de compra do texto abaixo e retorne SOMENTE JSON válido:
{"categories":["lista de categorias em português, minúsculo, ex: teclado, monitor, fone, mouse, notebook, tv, ssd, cadeira"],"brands":["marcas mencionadas, ex: Sony, Logitech"],"maxPriceBrl":null_ou_numero,"minDiscountPct":15_ou_numero_se_mencionado}

Texto: "${text}"

Regras:
- categories: palavras-chave de produtos (não marcas)
- Se disser "qualquer coisa" ou "tudo": categories = []
- Se não mencionar preço máximo: maxPriceBrl = null
- Se não mencionar desconto mínimo: minDiscountPct = 15`
    }]
  });
  const raw = message.content?.[0]?.text || "{}";
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  } catch {
    return { categories: [], brands: [], maxPriceBrl: null, minDiscountPct: 15 };
  }
}

function buildStatusMessage(user) {
  const prefs = user.preferences || {};
  const cats = (prefs.categories || []);
  const brands = (prefs.brands || []);
  const lines = [];
  if (cats.length) lines.push(`📦 *Categorias:* ${cats.join(", ")}`);
  else lines.push(`📦 *Categorias:* qualquer produto tech`);
  if (brands.length) lines.push(`🏷 *Marcas:* ${brands.join(", ")}`);
  if (prefs.maxPriceBrl) lines.push(`💰 *Preço máximo:* R$${prefs.maxPriceBrl}`);
  lines.push(`🔥 *Desconto mínimo:* ${prefs.minDiscountPct || 15}%`);
  return `*Suas preferências atuais:*\n\n${lines.join("\n")}\n\nUse /editar para mudar ou /parar para pausar.`;
}

export async function handleNewChatMember(member, chatId, config) {
  const firstName = member.first_name || "você";
  const username = member.username ? `@${member.username}` : firstName;
  const botUsername = config.telegramBotUsername || "TDOLinksBot";

  const text =
    `👋 Bem-vindo(a), ${username}!\n\n` +
    `Além das promoções do canal, você pode receber *só o que te interessa* no privado — teclados, monitores, fones, notebooks, o que quiser.\n\n` +
    `É grátis. Basta clicar abaixo e me dizer o que você quer receber 👇`;

  await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{
          text: "🔔 Quero receber deals personalizados",
          url: `https://t.me/${botUsername}?start=welcome`
        }]]
      }
    })
  }).catch(() => {});
}

export async function handleTelegramUpdate(update, db, config) {
  // New member joining the group
  if (update.message?.new_chat_members?.length) {
    for (const member of update.message.new_chat_members) {
      if (member.is_bot) continue;
      await handleNewChatMember(member, update.message.chat.id, config);
    }
    return;
  }

  const message = update.message || update.edited_message;
  if (!message) return;

  const chatId = String(message.chat.id);
  const userId = String(message.from.id);
  const firstName = message.from.first_name || "";
  const username = message.from.username || "";
  const text = (message.text || "").trim();

  if (!db.saveUser) return; // JsonDb fallback — no-op

  // Persist/update user record
  await db.saveUser({ telegramUserId: userId, telegramChatId: chatId, firstName, username });

  const user = await db.getUser(userId);
  const cmd = text.startsWith("/") ? text.split(" ")[0].split("@")[0].toLowerCase() : null;

  if (cmd === "/start" || cmd === "/editar") {
    await db.setOnboardingDone && (async () => {
      // Mark onboarding as pending so next free text is treated as preference input
      await db.pool.query(
        `UPDATE telegram_users SET onboarding_done = false, subscribed = true, updated_at = now() WHERE telegram_user_id = $1`,
        [userId]
      );
    })();
    await sendMessage(chatId, ONBOARDING_MESSAGE(firstName), config.telegramBotToken);
    return;
  }

  if (cmd === "/parar") {
    await db.setUserSubscribed(userId, false);
    await sendMessage(chatId, "✅ Alertas pausados. Use /start para reativar quando quiser.", config.telegramBotToken);
    return;
  }

  if (cmd === "/status") {
    if (!user || !user.onboarding_done) {
      await sendMessage(chatId, "Você ainda não configurou suas preferências. Use /start para começar.", config.telegramBotToken);
    } else {
      await sendMessage(chatId, buildStatusMessage(user), config.telegramBotToken);
    }
    return;
  }

  if (cmd === "/ajuda" || cmd === "/help") {
    await sendMessage(chatId, HELP_MESSAGE, config.telegramBotToken);
    return;
  }

  // Free text — treat as preference input if onboarding pending
  if (!user || !user.onboarding_done) {
    const prefs = await parsePreferencesWithAI(text, config.anthropicApiKey);
    await db.savePreferences(userId, {
      categories: prefs.categories || [],
      brands: prefs.brands || [],
      maxPriceBrl: prefs.maxPriceBrl || null,
      minDiscountPct: prefs.minDiscountPct || 15,
      rawText: text
    });
    await db.pool.query(
      `UPDATE telegram_users SET onboarding_done = true, subscribed = true, updated_at = now() WHERE telegram_user_id = $1`,
      [userId]
    );
    const summary = buildStatusMessage({ preferences: prefs });
    await sendMessage(
      chatId,
      `✅ Perfeito! Salvo com sucesso.\n\n${summary}\n\nA partir de agora vou te avisar quando aparecer algo que combina. Use /editar para ajustar a qualquer momento.`,
      config.telegramBotToken
    );
    return;
  }

  // Default: remind user of commands
  await sendMessage(chatId, HELP_MESSAGE, config.telegramBotToken);
}
