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
