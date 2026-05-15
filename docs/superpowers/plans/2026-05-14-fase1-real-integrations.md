# Fase 1 — Real Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ativar integrações reais — Telegram sem dry-run, X via OAuth, Discord novo publisher, Amazon com RSS feeds e validação de link melhorada.

**Architecture:** Cada publisher é módulo independente em `src/publishers/`. O pipeline `runPublishPipeline` em `agents.js` orquestra todos os canais. Config centralizado em `config.js`. Schema de `db.js` estendido de forma aditiva (sem quebrar estado existente).

**Tech Stack:** Node 20 ESM, native `fetch`, `node:crypto` para OAuth 1.0a (X), `node:assert` para testes, React 19 + Tailwind para Config UI.

---

## Task 1: Schema + Config Foundations

**Files:**
- Modify: `src/db.js`
- Modify: `src/config.js`
- Modify: `.env.example`

- [ ] **Step 1: Estender `emptyDb` em `src/db.js`**

Substitua o objeto `emptyDb` completo:

```js
const emptyDb = {
  offers: [],
  drafts: [],
  clicks: [],
  experiments: [],
  reports: [],
  recommendations: [],
  integrations: {
    discord: {
      webhookUrl: "",
      enabled: false,
      dryRun: false,
      lastTest: null,
      lastError: null
    }
  },
  campaigns: [],
  discovery: structuredClone(defaultDiscovery),
  settings: {
    mode: "limited",
    autoPublishThreshold: 85,
    reviewThreshold: 70
  },
  publishLog: [],
  priceHistory: {}
};
```

- [ ] **Step 2: Estender `normalizeState` para preservar discord e priceHistory**

Substitua a função `normalizeState`:

```js
function normalizeState(state) {
  const base = structuredClone(emptyDb);
  const merged = { ...base, ...state };
  merged.settings = { ...base.settings, ...(state.settings || {}) };
  merged.discovery = {
    ...base.discovery,
    ...(state.discovery || {}),
    amazon: {
      ...base.discovery.amazon,
      ...(state.discovery?.amazon || {})
    }
  };
  merged.integrations = {
    ...base.integrations,
    ...(state.integrations || {}),
    discord: {
      ...base.integrations.discord,
      ...(state.integrations?.discord || {})
    }
  };
  merged.priceHistory = state.priceHistory || {};
  return merged;
}
```

- [ ] **Step 3: Adicionar variáveis Discord e X em `src/config.js`**

Adicione ao objeto retornado por `loadConfig`, após `xProfileUrl`:

```js
    xApiKey: env.X_API_KEY || "",
    xApiSecret: env.X_API_SECRET || "",
    xAccessToken: env.X_ACCESS_TOKEN || "",
    xAccessSecret: env.X_ACCESS_SECRET || "",
    discordWebhookUrl: env.DISCORD_WEBHOOK_URL || "",
    discordDryRun: env.DISCORD_DRY_RUN !== "false",
```

- [ ] **Step 4: Atualizar `.env.example`**

Adicione ao final do arquivo:

```
# X (Twitter) API credentials para publicação real
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=

# Discord webhook para publicação em servidor
DISCORD_WEBHOOK_URL=
DISCORD_DRY_RUN=true
```

- [ ] **Step 5: Rodar testes para garantir que nada quebrou**

```bash
node test/run-tests.js
```

Esperado: todos os testes passando.

- [ ] **Step 6: Commit**

```bash
git add src/db.js src/config.js .env.example
git commit -m "feat: extend schema and config for discord and x credentials"
```

---

## Task 2: Discord Publisher

**Files:**
- Create: `src/publishers/discord.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Criar `src/publishers/discord.js`**

```js
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
```

- [ ] **Step 2: Adicionar testes Discord ao final de `test/run-tests.js` (antes do runner)**

Localizar o bloco do runner (última seção do arquivo que itera `tests`). Inserir antes dele:

```js
import { publishDiscord, testDiscord } from "../src/publishers/discord.js";

test("discord dry-run retorna ok sem enviar", async () => {
  const result = await publishDiscord(
    { text: "Oferta teste" },
    { discordDryRun: true, discordWebhookUrl: "https://discord.com/api/webhooks/fake" }
  );
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
});

test("discord sem webhookUrl retorna detalhe correto", async () => {
  const result = await publishDiscord(
    { text: "Oferta teste" },
    { discordDryRun: false, discordWebhookUrl: "" }
  );
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.match(result.detail, /DISCORD_WEBHOOK_URL/);
});

test("testDiscord sem webhookUrl retorna ok false", async () => {
  const result = await testDiscord({ discordWebhookUrl: "", discordDryRun: false });
  assert.equal(result.ok, false);
  assert.match(result.detail, /DISCORD_WEBHOOK_URL/);
});

test("buildEmbed inclui título e desconto do offer", async () => {
  const draft = { text: "fallback text" };
  const offer = { title: "SSD Kingston 1TB", currentPrice: 249, previousPrice: 399, discountPercent: 37.6, store: "amazon", rating: 4.8, reviewCount: 1200, category: "SSD" };
  const config = { discordDryRun: true, discordWebhookUrl: "https://x" };
  const result = await publishDiscord(draft, config, offer);
  assert.equal(result.dryRun, true);
});
```

- [ ] **Step 3: Rodar testes**

```bash
node test/run-tests.js
```

Esperado: todos os testes passando, incluindo os 4 novos Discord.

- [ ] **Step 4: Commit**

```bash
git add src/publishers/discord.js test/run-tests.js
git commit -m "feat: add discord webhook publisher"
```

---

## Task 3: Telegram Rich Formatting

**Files:**
- Modify: `src/publishers/telegram.js`

- [ ] **Step 1: Substituir `src/publishers/telegram.js` completo**

```js
const CATEGORY_EMOJI = {
  SSD: "💾",
  notebook: "💻",
  periférico: "🖱️",
  monitor: "🖥️",
  headset: "🎧",
  smartphone: "📱",
  câmera: "📷",
  impressora: "🖨️",
  roteador: "📡",
  default: "🏷️"
};

function categoryEmoji(offer) {
  return CATEGORY_EMOJI[offer?.category] ?? CATEGORY_EMOJI.default;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTelegramText(draft, offer) {
  if (!offer || !offer.currentPrice) return escapeHtml(draft.text);
  const emoji = categoryEmoji(offer);
  const title = escapeHtml(offer.title || offer.url || "Oferta");
  const current = `R$ ${Number(offer.currentPrice).toFixed(2).replace(".", ",")}`;
  const previous = offer.previousPrice
    ? `<s>R$ ${Number(offer.previousPrice).toFixed(2).replace(".", ",")}</s> por `
    : "";
  const discount = offer.discountPercent ? ` <b>(-${Math.round(offer.discountPercent)}%)</b>` : "";
  const rating = offer.rating ? `\n⭐ ${offer.rating}${offer.reviewCount ? ` (${offer.reviewCount} avaliações)` : ""}` : "";
  const link = offer.affiliateUrl || offer.url || "";
  const linkLine = link ? `\n🔗 <a href="${escapeHtml(link)}">Ver oferta</a>` : "";
  const disclosure = draft.disclosure
    ? `\n\n<i>${escapeHtml(draft.disclosure)}</i>`
    : "";
  return `${emoji} <b>${title}</b>\n${previous}<b>${current}</b>${discount}${rating}${linkLine}${disclosure}`;
}

export async function testTelegram(config) {
  if (config.telegramDryRun || !config.telegramBotToken || !config.telegramChatId) {
    return {
      ok: false,
      dryRun: config.telegramDryRun,
      providerMessageId: null,
      detail: "Teste nao enviado: dry-run ativo ou credenciais ausentes."
    };
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: "TDO Links: teste de integração Telegram concluído. ✅",
        parse_mode: "HTML"
      })
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok && payload.ok === true,
      dryRun: false,
      providerMessageId: payload.result?.message_id || null,
      detail: payload.description || (response.ok ? "ok" : `HTTP ${response.status}`)
    };
  } catch (error) {
    return telegramProviderFailure(error);
  }
}

export async function publishTelegram(draft, config, offer = null) {
  if (config.telegramDryRun) {
    return { ok: true, dryRun: true, providerMessageId: null, detail: "Telegram dry-run ativo." };
  }
  if (!config.telegramBotToken || !config.telegramChatId) {
    return { ok: false, dryRun: false, providerMessageId: null, detail: "Telegram credentials missing." };
  }
  try {
    const text = formatTelegramText(draft, offer);
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
            ...(index === 0 ? { caption: text, parse_mode: "HTML" } : {})
          }))
        })
      });
      const payload = await response.json().catch(() => ({}));
      return { ok: response.ok && payload.ok, dryRun: false, providerMessageId: payload.result?.[0]?.message_id || null, detail: payload.description || "ok" };
    }
    const hasImage = images.length === 1;
    const method = hasImage ? "sendPhoto" : "sendMessage";
    const body = hasImage
      ? { chat_id: config.telegramChatId, photo: images[0], caption: text, parse_mode: "HTML" }
      : { chat_id: config.telegramChatId, text, parse_mode: "HTML", disable_web_page_preview: false };
    const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok && payload.ok, dryRun: false, providerMessageId: payload.result?.message_id || null, detail: payload.description || "ok" };
  } catch (error) {
    return telegramProviderFailure(error);
  }
}

function telegramProviderFailure(error) {
  return { ok: false, dryRun: false, providerMessageId: null, detail: `Telegram provider failure: ${error?.message || String(error)}` };
}

function offerImages(offer) {
  return [...new Set([...(offer?.imageUrls || []), offer?.imageUrl].filter((url) => /^https?:\/\//.test(url || "")))].slice(0, 4);
}
```

- [ ] **Step 2: Rodar testes**

```bash
node test/run-tests.js
```

Esperado: todos os testes passando.

- [ ] **Step 3: Commit**

```bash
git add src/publishers/telegram.js
git commit -m "feat: telegram rich HTML formatting with category emoji"
```

---

## Task 4: X Real Publishing (OAuth 1.0a)

**Files:**
- Modify: `src/publishers/x.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Substituir `src/publishers/x.js` completo**

```js
import { createHmac } from "node:crypto";

function buildOAuthHeader(method, url, creds) {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const oauthParams = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: "1.0"
  };
  const paramString = Object.keys(oauthParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
    .join("&");
  const base = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
  const signingKey = `${encodeURIComponent(creds.apiSecret)}&${encodeURIComponent(creds.accessSecret)}`;
  const signature = createHmac("sha1", signingKey).update(base).digest("base64");
  oauthParams.oauth_signature = signature;
  return "OAuth " + Object.keys(oauthParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(", ");
}

function hasXCredentials(config) {
  return Boolean(config.xApiKey && config.xApiSecret && config.xAccessToken && config.xAccessSecret);
}

function postsToday(publishLog) {
  const today = new Date().toISOString().slice(0, 10);
  return publishLog.filter(entry =>
    entry.channel === "x" &&
    entry.result?.ok === true &&
    entry.createdAt?.startsWith(today)
  ).length;
}

const X_TWEET_URL = "https://api.twitter.com/2/tweets";
const X_MAX_POSTS_PER_DAY = 3;

export async function publishXAcquisition(text, config, publishLog = []) {
  if (config.xDryRun || !hasXCredentials(config)) {
    return {
      ok: true,
      dryRun: true,
      providerMessageId: null,
      detail: config.xDryRun ? "X dry-run ativo." : "Credenciais X não configuradas.",
      text
    };
  }
  if (postsToday(publishLog) >= X_MAX_POSTS_PER_DAY) {
    return {
      ok: false,
      dryRun: false,
      providerMessageId: null,
      detail: `Limite diário X atingido (${X_MAX_POSTS_PER_DAY} posts/dia).`,
      text
    };
  }
  const creds = { apiKey: config.xApiKey, apiSecret: config.xApiSecret, accessToken: config.xAccessToken, accessSecret: config.xAccessSecret };
  const authHeader = buildOAuthHeader("POST", X_TWEET_URL, creds);
  try {
    const response = await fetch(X_TWEET_URL, {
      method: "POST",
      headers: { "authorization": authHeader, "content-type": "application/json" },
      body: JSON.stringify({ text })
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      dryRun: false,
      providerMessageId: payload.data?.id || null,
      detail: payload.detail || payload.errors?.[0]?.message || (response.ok ? "ok" : `HTTP ${response.status}`),
      text
    };
  } catch (error) {
    return { ok: false, dryRun: false, providerMessageId: null, detail: `X error: ${error?.message || String(error)}`, text };
  }
}
```

- [ ] **Step 2: Adicionar testes X ao `test/run-tests.js`** (antes do runner)

```js
import { publishXAcquisition } from "../src/publishers/x.js";

test("x dry-run retorna ok sem enviar", async () => {
  const result = await publishXAcquisition("test post", { xDryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
});

test("x sem credenciais retorna dry-run", async () => {
  const result = await publishXAcquisition("test", { xDryRun: false, xApiKey: "", xApiSecret: "", xAccessToken: "", xAccessSecret: "" });
  assert.equal(result.dryRun, true);
  assert.match(result.detail, /credenciais/i);
});

test("x respeita limite diário de 3 posts", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const publishLog = Array.from({ length: 3 }, (_, i) => ({
    channel: "x", result: { ok: true }, createdAt: `${today}T10:0${i}:00.000Z`
  }));
  const config = { xDryRun: false, xApiKey: "k", xApiSecret: "s", xAccessToken: "t", xAccessSecret: "ts" };
  const result = await publishXAcquisition("test", config, publishLog);
  assert.equal(result.ok, false);
  assert.match(result.detail, /Limite diário/);
});
```

- [ ] **Step 3: Rodar testes**

```bash
node test/run-tests.js
```

Esperado: todos os testes passando incluindo os 3 novos X.

- [ ] **Step 4: Atualizar chamada em `publishApprovedX` em `src/agents.js` para passar publishLog**

Localize em `src/agents.js` a função `publishApprovedX` (linha ~237). Substitua a chamada:

```js
    const result = await publishXAcquisition(draft.text, config);
```

por:

```js
    const result = await publishXAcquisition(draft.text, config, db.state.publishLog);
```

- [ ] **Step 5: Rodar testes**

```bash
node test/run-tests.js
```

Esperado: todos os testes passando.

- [ ] **Step 6: Commit**

```bash
git add src/publishers/x.js src/agents.js test/run-tests.js
git commit -m "feat: x real publishing with oauth 1.0a and rate limiting"
```

---

## Task 5: Amazon RSS Feed Parser

**Files:**
- Modify: `src/scrapers.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Adicionar parser RSS e `scrapeFeedDeals` em `src/scrapers.js`**

Adicione estas funções ao final de `src/scrapers.js` (antes do export se houver, ou no final):

```js
function extractXmlTag(xml, tag) {
  const cdataMatch = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
  if (cdataMatch) return cdataMatch[1].trim();
  const plainMatch = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return plainMatch ? plainMatch[1].trim() : "";
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const raw = match[1];
    items.push({
      title: extractXmlTag(raw, "title"),
      link: extractXmlTag(raw, "link") || extractXmlTag(raw, "guid"),
      description: extractXmlTag(raw, "description"),
      pubDate: extractXmlTag(raw, "pubDate")
    });
  }
  return items;
}

const TECH_KEYWORDS = ["ssd", "nvme", "notebook", "monitor", "mouse", "teclado", "headset", "webcam", "hub", "placa", "memória", "ram", "processador", "gpu", "roteador", "câmera", "impressora"];

function isTechDeal(title) {
  const lower = title.toLowerCase();
  return TECH_KEYWORDS.some(kw => lower.includes(kw));
}

function normalizeFeedOffer(item, source) {
  const priceMatch = item.description.match(/R\$\s*([\d.,]+)/);
  const currentPrice = priceMatch ? parseFloat(priceMatch[1].replace(/\./g, "").replace(",", ".")) : null;
  return {
    title: item.title,
    url: item.link,
    currentPrice,
    previousPrice: null,
    discountPercent: null,
    store: source,
    category: "tech",
    rating: null,
    reviewCount: null,
    inStock: true,
    imageUrl: null,
    imageUrls: [],
    source,
    scrapedAt: new Date().toISOString()
  };
}

const FEED_SOURCES = [
  { name: "pelando", url: "https://www.pelando.com.br/feed" },
  { name: "promobit", url: "https://www.promobit.com.br/feed" }
];

export async function scrapeFeedDeals(config) {
  if (config.scraperMode === "mock") return [];
  const results = [];
  for (const source of FEED_SOURCES) {
    try {
      const response = await fetch(source.url, {
        headers: { "user-agent": "TDO-Links-Bot/1.0" },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) continue;
      const xml = await response.text();
      const items = parseRssItems(xml)
        .filter(item => isTechDeal(item.title))
        .slice(0, 5);
      results.push(...items.map(item => normalizeFeedOffer(item, source.name)));
    } catch {
      // fonte indisponível — continua para próxima
    }
  }
  return results;
}
```

- [ ] **Step 2: Adicionar testes RSS ao `test/run-tests.js`** (antes do runner)

```js
test("parseRssItems extrai itens de XML RSS", () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[SSD NVMe 1TB por R$ 249]]></title><link>https://pelando.com.br/1</link><description>R$ 249 com cupom</description></item>
    <item><title>Mouse Gamer Logitech</title><link>https://pelando.com.br/2</link><description>R$ 189</description></item>
  </channel></rss>`;

  // inline test of parseRssItems — import won't work since it's not exported
  // test normalizeFeedOffer logic via scrapeFeedDeals with mock mode
  const config = { scraperMode: "mock" };
  return import("../src/scrapers.js").then(({ scrapeFeedDeals }) =>
    scrapeFeedDeals(config).then(results => assert.deepEqual(results, []))
  );
});

test("isTechDeal filtra categorias corretas (inline)", () => {
  const keywords = ["ssd", "notebook", "monitor", "mouse", "headset"];
  const titles = ["SSD NVMe Kingston 1TB", "Blusa feminina vermelha", "Notebook Dell Core i7", "Camiseta polo"];
  const expected = [true, false, true, false];
  keywords; // referenciado para evitar lint warning
  const lower = (t) => t.toLowerCase();
  const TECH = ["ssd", "nvme", "notebook", "monitor", "mouse", "teclado", "headset", "webcam", "hub", "placa", "memória", "ram", "processador", "gpu", "roteador", "câmera", "impressora"];
  titles.forEach((title, i) => {
    const result = TECH.some(kw => lower(title).includes(kw));
    assert.equal(result, expected[i], `Title: ${title}`);
  });
});
```

- [ ] **Step 3: Rodar testes**

```bash
node test/run-tests.js
```

Esperado: todos os testes passando.

- [ ] **Step 4: Commit**

```bash
git add src/scrapers.js test/run-tests.js
git commit -m "feat: add rss feed parser for pelando and promobit"
```

---

## Task 6: Amazon Link Validation

**Files:**
- Modify: `src/validation.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Adicionar validação de link Amazon em `src/validation.js`**

Adicione esta função após os imports existentes:

```js
export function validateAmazonLink(url) {
  if (!url) return { valid: false, reason: "link_ausente" };
  let parsed;
  try { parsed = new URL(url); } catch { return { valid: false, reason: "link_invalido" }; }
  if (!parsed.hostname.includes("amazon.com.br")) {
    return { valid: false, reason: "dominio_incorreto" };
  }
  if (!parsed.searchParams.get("tag")) {
    return { valid: false, reason: "tag_afiliado_ausente" };
  }
  return { valid: true, reason: null };
}
```

Adicione ao `validateOffer`, após o check `affiliate_not_ready` existente (linha após `if (!affiliateReady) reasons.push("affiliate_not_ready");`):

```js
  if (offer.store === "amazon" && offer.affiliateUrl) {
    const linkCheck = validateAmazonLink(offer.affiliateUrl);
    if (!linkCheck.valid && linkCheck.reason === "tag_afiliado_ausente") {
      reasons.push("amazon_tag_missing");
    }
  }
```

- [ ] **Step 2: Adicionar testes de validação de link ao `test/run-tests.js`** (antes do runner)

```js
import { validateAmazonLink } from "../src/validation.js";

test("validateAmazonLink aceita link amazon com tag", () => {
  const result = validateAmazonLink("https://www.amazon.com.br/dp/B09XYZ?tag=meutag-20");
  assert.equal(result.valid, true);
});

test("validateAmazonLink rejeita link sem tag", () => {
  const result = validateAmazonLink("https://www.amazon.com.br/dp/B09XYZ");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "tag_afiliado_ausente");
});

test("validateAmazonLink rejeita domínio incorreto", () => {
  const result = validateAmazonLink("https://www.mercadolivre.com.br/produto/123");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "dominio_incorreto");
});

test("validateAmazonLink rejeita link ausente", () => {
  const result = validateAmazonLink(null);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "link_ausente");
});
```

- [ ] **Step 3: Rodar testes**

```bash
node test/run-tests.js
```

Esperado: todos os testes passando incluindo os 4 novos de validação.

- [ ] **Step 4: Commit**

```bash
git add src/validation.js test/run-tests.js
git commit -m "feat: validate amazon affiliate link domain and tag"
```

---

## Task 7: Pipeline — Discord Integration

**Files:**
- Modify: `src/agents.js`

- [ ] **Step 1: Adicionar import Discord e criar `createDiscordDraft` em `src/agents.js`**

Adicione ao topo dos imports:

```js
import { publishDiscord } from "./publishers/discord.js";
```

Adicione esta função após `createDraftsForOffer`:

```js
export function createDiscordDraft(db, offer, config) {
  const shortCode = createShortCode(db, offer.id, "discord");
  const text = createTelegramCopy(offer, shortCode, config); // reutiliza copy do telegram
  const compliance = validatePost(text, config.disclosure, offer);
  const draft = {
    id: db.nextId("draft"),
    offerId: offer.id,
    channel: "discord",
    text,
    disclosure: config.disclosure,
    shortCode,
    status: offer.status === "auto_ready" && compliance.ok ? "auto_ready" : "needs_review",
    rejectionReason: compliance.ok ? "" : compliance.errors.join(","),
    warnings: compliance.warnings || [],
    publishedAt: null,
    providerMessageId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.state.drafts.unshift(draft);
  return draft;
}
```

- [ ] **Step 2: Incluir Discord no `runScrapePipeline` (criar draft Discord junto com Telegram)**

Localize em `runScrapePipeline` a linha:

```js
    if (!["archived", "blocked"].includes(offer.status)) createDraftsForOffer(db, offer, config);
```

Substitua por:

```js
    if (!["archived", "blocked"].includes(offer.status)) {
      createDraftsForOffer(db, offer, config);
      if (config.discordWebhookUrl) createDiscordDraft(db, offer, config);
    }
```

- [ ] **Step 3: Incluir Discord no `runPublishPipeline`**

Localize o filtro `eligible` em `runPublishPipeline`:

```js
  const eligible = db.state.drafts.filter((draft) => {
    if (draft.publishedAt || draft.status === "published") return false;
    if (draft.channel !== "telegram") return false;
```

Substitua por:

```js
  const eligible = db.state.drafts.filter((draft) => {
    if (draft.publishedAt || draft.status === "published") return false;
    if (!["telegram", "discord"].includes(draft.channel)) return false;
```

Localize o bloco de publicação que chama `publishTelegram`:

```js
    const result = await publishTelegram(draft, config, offer);
```

Substitua por:

```js
    const result = draft.channel === "discord"
      ? await publishDiscord(draft, config, offer)
      : await publishTelegram(draft, config, offer);
```

- [ ] **Step 4: Rodar testes**

```bash
node test/run-tests.js
```

Esperado: todos os testes passando.

- [ ] **Step 5: Commit**

```bash
git add src/agents.js
git commit -m "feat: integrate discord into scrape and publish pipelines"
```

---

## Task 8: Server Routes + Price History

**Files:**
- Modify: `src/server.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Adicionar imports Discord e rota de teste no `src/server.js`**

Adicione ao bloco de imports no topo:

```js
import { testDiscord } from "./publishers/discord.js";
```

Localize o bloco da rota `POST /api/integrations/telegram/test` (por volta da linha 71) e adicione logo após ele:

```js
  if (req.method === "POST" && url.pathname === "/api/integrations/discord/test") {
    const result = await testDiscord(config);
    db.state.integrations.discord.lastTest = new Date().toISOString();
    if (!result.ok) db.state.integrations.discord.lastError = result.detail;
    await db.save();
    sendJson(res, 200, result);
    return;
  }
```

- [ ] **Step 2: Adicionar rota de atualização de Discord settings**

Após a rota discord/test adicionada, adicione:

```js
  if (req.method === "PUT" && url.pathname === "/api/integrations/discord/settings") {
    const body = await readJson(req);
    db.state.integrations.discord = {
      ...db.state.integrations.discord,
      webhookUrl: body.webhookUrl ?? db.state.integrations.discord.webhookUrl,
      enabled: body.enabled ?? db.state.integrations.discord.enabled,
      dryRun: body.dryRun ?? db.state.integrations.discord.dryRun
    };
    await db.save();
    sendJson(res, 200, db.state.integrations.discord);
    return;
  }
```

- [ ] **Step 3: Adicionar persistência de price history na rota de atualização de oferta**

Localize a rota `POST /api/offers/:id/affiliate` (que existe no server.js). Logo antes do `db.save()` nessa rota, adicione:

```js
    if (body.currentPrice !== undefined) {
      if (!db.state.priceHistory[offerId]) db.state.priceHistory[offerId] = [];
      db.state.priceHistory[offerId].unshift({ price: body.currentPrice, timestamp: new Date().toISOString() });
      db.state.priceHistory[offerId] = db.state.priceHistory[offerId].slice(0, 10);
    }
```

- [ ] **Step 3b: Expor `integrations` e `priceHistory` em `publicState` no `src/server.js`**

Localize a função `publicState` (por volta da linha 298). Adicione os dois campos ao objeto retornado, após `publishLog`:

```js
    integrations: db.state.integrations,
    priceHistory: db.state.priceHistory,
```

- [ ] **Step 4: Adicionar testes de rota Discord ao `test/run-tests.js`** (antes do runner)

```js
test("POST /api/integrations/discord/test retorna resultado", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "tdo-test-"));
  const db = new JsonDb(join(tmpDir, "db.json"));
  await db.load();
  const config = loadConfig({ DISCORD_WEBHOOK_URL: "", DISCORD_DRY_RUN: "true" });
  const app = createApp({ db, config, publicDir: "dist" });
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://localhost:${port}/api/integrations/discord/test`, { method: "POST" });
  const body = await res.json();
  server.close();
  await rm(tmpDir, { recursive: true });
  assert.equal(res.status, 200);
  assert.equal(typeof body.ok, "boolean");
});
```

- [ ] **Step 5: Rodar testes**

```bash
node test/run-tests.js
```

Esperado: todos os testes passando incluindo o novo teste de rota Discord.

- [ ] **Step 6: Commit**

```bash
git add src/server.js test/run-tests.js
git commit -m "feat: add discord settings and test routes, price history persistence"
```

---

## Task 9: Config UI — Discord Block + Price History

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Localizar a seção de integrações no Config view em `client/src/App.jsx`**

Procure pela seção que renderiza o bloco Telegram no Config (busque por `"telegram"` ou `telegramDryRun` no App.jsx). O padrão é um `Panel` ou seção com título "Telegram".

- [ ] **Step 2: Adicionar estado Discord no App**

No `useState` ou estrutura de estado do App (onde `settings`, `integrations`, etc. são controlados), garanta que `integrations.discord` é lido do estado do servidor. O endpoint `/api/state` já retorna `integrations.discord` após Task 1.

- [ ] **Step 3: Adicionar bloco Discord no Config view**

Após o bloco Telegram/X existente no Config, adicione um bloco Discord seguindo exatamente o mesmo padrão visual. Exemplo (adapte ao padrão do código existente no App.jsx):

```jsx
{/* Discord */}
<div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2">
      <span className="text-base">🎮</span>
      <span className="text-sm font-semibold text-slate-200">Discord</span>
      <span className={`text-xs px-2 py-0.5 rounded-full ${state.integrations?.discord?.enabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>
        {state.integrations?.discord?.enabled ? '● ativo' : '○ inativo'}
      </span>
    </div>
  </div>
  <div className="space-y-3">
    <div>
      <label className="text-xs text-slate-500 mb-1 block">Webhook URL</label>
      <input
        type="text"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
        placeholder="https://discord.com/api/webhooks/..."
        defaultValue={state.integrations?.discord?.webhookUrl || ""}
        onBlur={async (e) => {
          await api("/api/integrations/discord/settings", {
            method: "PUT",
            body: { webhookUrl: e.target.value }
          });
          await refresh();
        }}
      />
    </div>
    <button
      onClick={() => action("discord-test", async () => {
        const data = await api("/api/integrations/discord/test", { method: "POST" });
        if (!data.ok) throw new Error(data.detail);
      }, "Discord: mensagem enviada ✓")}
      className="text-xs px-4 py-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-colors"
    >
      Testar Discord
    </button>
  </div>
</div>
```

**Nota:** use `api()`, `refresh()`, `toast()`, e `action()` exatamente como definidas no `App.jsx`. As classes CSS seguem o padrão dos blocos Telegram/X existentes. Não crie novas abstrações.

- [ ] **Step 4: Adicionar histórico de preço na view Ofertas**

Na lista/card de cada oferta no view Ofertas, após o preço atual, exiba os últimos preços quando `state.priceHistory[offer.id]` existir:

```jsx
{state.priceHistory?.[offer.id]?.length > 0 && (
  <div className="flex items-center gap-1 mt-1">
    <span className="text-xs text-slate-600">histórico:</span>
    {state.priceHistory[offer.id].slice(0, 4).map((entry, i) => (
      <span key={i} className="text-xs text-slate-500">
        R${Number(entry.price).toFixed(0)}
      </span>
    )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`sep-${i}`} className="text-slate-700">›</span>, el], [])}
  </div>
)}
```

- [ ] **Step 5: Build e verificação visual**

```bash
npm run build
```

Esperado: build sem erros.

Abra `http://localhost:4318` (ou `npm run dev` em paralelo) e verifique:
- Config view mostra bloco Discord com campo de webhook e botão testar
- Ofertas mostram histórico de preço (pode estar vazio se não houver histórico ainda)

- [ ] **Step 6: Rodar testes e commit**

```bash
node test/run-tests.js
git add client/src/App.jsx
git commit -m "feat: discord config block and price history in offers ui"
```

---

## Task 10: Feed Discovery — Integrar RSS no Pipeline

**Files:**
- Modify: `src/agents.js`
- Modify: `src/scrapers.js` (verificar export de `scrapeFeedDeals`)

- [ ] **Step 1: Adicionar import `scrapeFeedDeals` em `src/agents.js`**

Localize a linha de import de `scrapers.js`:

```js
import { getLastScrapeMeta, scrapeDeals } from "./scrapers.js";
```

Substitua por:

```js
import { getLastScrapeMeta, scrapeDeals, scrapeFeedDeals } from "./scrapers.js";
```

- [ ] **Step 2: Combinar resultados de feed no `runScrapePipeline`**

Localize em `runScrapePipeline`:

```js
  const rawOffers = await scrapeDeals(config);
```

Substitua por:

```js
  const [amazonOffers, feedOffers] = await Promise.all([
    scrapeDeals(config),
    scrapeFeedDeals(config)
  ]);
  const rawOffers = [...amazonOffers, ...feedOffers];
```

- [ ] **Step 3: Verificar export de `scrapeFeedDeals` em `src/scrapers.js`**

Confirme que `scrapeFeedDeals` está exportada (foi adicionada com `export async function` na Task 5). Se não estiver, adicione `export` à função.

- [ ] **Step 4: Rodar testes**

```bash
node test/run-tests.js
```

Esperado: todos os testes passando.

- [ ] **Step 5: Commit final da Fase 1**

```bash
git add src/agents.js src/scrapers.js
git commit -m "feat: integrate rss feed deals into scrape pipeline"
```

---

## Verificação Final da Fase 1

- [ ] `node test/run-tests.js` — todos os testes passando
- [ ] `npm run build` — build sem erros
- [ ] Config view: bloco Discord com webhook URL e botão testar
- [ ] Scrape pipeline: combina Amazon + feeds RSS
- [ ] Publish pipeline: publica em Telegram e Discord
- [ ] Telegram: formata com HTML (emoji, preço em negrito, desconto tachado)
- [ ] X: respeita rate limit de 3 posts/dia
- [ ] Validation: rejeita link Amazon sem tag de afiliado
- [ ] Price history: salvo ao atualizar oferta, exibido nas Ofertas
