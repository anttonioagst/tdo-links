/**
 * Meta Publisher — TDO Links
 * Handles organic IG/FB posts + Meta Ads campaign creation.
 *
 * Requires in .env:
 *   META_ACCESS_TOKEN  — Page access token (never expires)
 *   META_PAGE_ID       — Facebook Page ID
 *   META_IG_USER_ID    — Instagram Business Account ID
 *   META_AD_ACCOUNT_ID — format: act_XXXXXXXXX
 */

import { readFileSync, createReadStream } from "fs";
import { basename } from "path";
import http from "http";
import { createServer } from "http";
import { networkInterfaces } from "os";

const BASE = "https://graph.facebook.com/v19.0";

const cfg = () => ({
  token:     process.env.META_ACCESS_TOKEN,
  pageId:    process.env.META_PAGE_ID,
  igId:      process.env.META_IG_USER_ID,
  adAccount: process.env.META_AD_ACCOUNT_ID, // "act_XXXXXXXXX"
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function apiGet(path, params = {}) {
  const { token } = cfg();
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.error) throw new Error(`Meta API: ${json.error.message} (code ${json.error.code})`);
  return json;
}

async function apiPost(path, body = {}) {
  const { token } = cfg();
  const url = `${BASE}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Meta API: ${json.error.message} (code ${json.error.code})`);
  return json;
}

async function apiPostMultipart(path, fields = {}, filePath = null) {
  const { token } = cfg();
  const url = `${BASE}/${path}?access_token=${token}`;

  const { FormData, File } = await import("node:buffer").then(() => globalThis);
  const form = new FormData();

  for (const [k, v] of Object.entries(fields)) form.append(k, v);

  if (filePath) {
    const fileBuffer = readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: "image/png" });
    form.append("source", blob, basename(filePath));
  }

  const res = await fetch(url, { method: "POST", body: form });
  const json = await res.json();
  if (json.error) throw new Error(`Meta API: ${json.error.message} (code ${json.error.code})`);
  return json;
}

/**
 * Temporarily serve a local file on HTTP so Meta can fetch it.
 * Starts a server, calls the callback, stops the server.
 */
async function withTempServer(filePath, callback) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const data = readFileSync(filePath);
        res.writeHead(200, { "Content-Type": "image/png", "Content-Length": data.length });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, "0.0.0.0", async () => {
      const port = server.address().port;

      // Prefer PUBLIC_BASE_URL if set (Railway), otherwise use local IP
      let host = process.env.PUBLIC_BASE_URL;
      if (!host || host.includes("localhost")) {
        const nets = networkInterfaces();
        const localIp = Object.values(nets).flat()
          .find(n => n.family === "IPv4" && !n.internal)?.address || "127.0.0.1";
        host = `http://${localIp}`;
      } else {
        // Strip trailing slash
        host = host.replace(/\/$/, "");
      }

      const publicUrl = `${host}:${port}/image.png`;

      try {
        const result = await callback(publicUrl);
        server.close(() => resolve(result));
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Instagram — Organic
// ─────────────────────────────────────────────────────────────

/**
 * Publish a single image to Instagram feed.
 * @param {string} imagePath  Local file path
 * @param {string} caption
 * @returns {Promise<{id: string, permalink: string}>}
 */
export async function publishInstagramPhoto(imagePath, caption) {
  const { igId } = cfg();

  const postId = await withTempServer(imagePath, async (imageUrl) => {
    // 1. Create media container
    const container = await apiPost(`${igId}/media`, {
      image_url: imageUrl,
      caption,
      media_type: "IMAGE",
    });

    // 2. Wait for processing
    await waitForMediaReady(igId, container.id);

    // 3. Publish
    const published = await apiPost(`${igId}/media_publish`, {
      creation_id: container.id,
    });

    return published.id;
  });

  const info = await apiGet(postId, { fields: "permalink" });
  console.log(`[Meta] IG post publicado: ${info.permalink}`);
  return { id: postId, permalink: info.permalink };
}

/**
 * Publish a carousel (multiple images) to Instagram feed.
 * @param {string[]} imagePaths  Array of local file paths (in order)
 * @param {string}   caption
 */
export async function publishInstagramCarousel(imagePaths, caption) {
  const { igId } = cfg();

  // For carousel we need all images served simultaneously — use PUBLIC_BASE_URL
  // or upload them sequentially with temp servers
  const childIds = [];

  for (const imgPath of imagePaths) {
    const childId = await withTempServer(imgPath, async (imageUrl) => {
      const res = await apiPost(`${igId}/media`, {
        image_url: imageUrl,
        is_carousel_item: true,
      });
      await waitForMediaReady(igId, res.id, 3);
      return res.id;
    });
    childIds.push(childId);
    await sleep(1000); // Rate limit buffer
  }

  // Create carousel container
  const carousel = await apiPost(`${igId}/media`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
  });

  await waitForMediaReady(igId, carousel.id);

  // Publish
  const published = await apiPost(`${igId}/media_publish`, {
    creation_id: carousel.id,
  });

  const info = await apiGet(published.id, { fields: "permalink" });
  console.log(`[Meta] IG carrossel publicado: ${info.permalink}`);
  return { id: published.id, permalink: info.permalink };
}

/**
 * Publish a Story image to Instagram.
 * NOTE: Link stickers cannot be added via API — add them manually after.
 */
export async function publishInstagramStory(imagePath, caption = "") {
  const { igId } = cfg();

  const postId = await withTempServer(imagePath, async (imageUrl) => {
    const container = await apiPost(`${igId}/media`, {
      image_url: imageUrl,
      media_type: "STORIES",
      ...(caption ? { caption } : {}),
    });

    await waitForMediaReady(igId, container.id);

    const published = await apiPost(`${igId}/media_publish`, {
      creation_id: container.id,
    });

    return published.id;
  });

  console.log(`[Meta] IG Story publicado: ${postId}`);
  console.log(`[Meta] IMPORTANTE: adicionar stickers de link manualmente no app.`);
  return { id: postId };
}

async function waitForMediaReady(igId, mediaId, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await apiGet(mediaId, { fields: "status_code" });
    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR") throw new Error(`Media ${mediaId} falhou no processamento`);
    await sleep(2000);
  }
  throw new Error(`Timeout aguardando media ${mediaId}`);
}

// ─────────────────────────────────────────────────────────────
// Facebook — Organic
// ─────────────────────────────────────────────────────────────

/**
 * Post a multi-photo publication to Facebook Page (appears as carousel/album).
 * Uses binary upload — no public URL needed.
 * @param {string[]} imagePaths
 * @param {string}   caption
 */
export async function publishFacebookCarousel(imagePaths, caption) {
  const { pageId } = cfg();
  const photoIds = [];

  // Upload each photo without publishing (published: false)
  for (const imgPath of imagePaths) {
    const result = await apiPostMultipart(`${pageId}/photos`, { published: "false" }, imgPath);
    photoIds.push({ media_fbid: result.id });
    await sleep(500);
  }

  // Create multi-photo post
  const post = await apiPost(`${pageId}/feed`, {
    message: caption,
    attached_media: photoIds,
  });

  const info = await apiGet(post.id, { fields: "permalink_url" });
  console.log(`[Meta] FB post publicado: ${info.permalink_url}`);
  return { id: post.id, permalink: info.permalink_url };
}

/**
 * Post a single photo to Facebook Page.
 */
export async function publishFacebookPhoto(imagePath, caption) {
  const { pageId } = cfg();
  const result = await apiPostMultipart(`${pageId}/photos`, { caption }, imagePath);
  console.log(`[Meta] FB foto publicada: ${result.id}`);
  return result;
}

// ─────────────────────────────────────────────────────────────
// Meta Ads — Campanhas Pagas
// ─────────────────────────────────────────────────────────────

/**
 * Create a full TOF + MOF + BOF campaign from a campaign config.
 *
 * @param {Object} config
 * @param {string} config.name         Campaign name prefix
 * @param {string[]} config.carouselImages  Local paths of carousel slides
 * @param {string} config.storyImage   Local path of story image
 * @param {Object} config.copy         { tof, mof, bof } — each with { primary, headline, cta }
 * @param {Object} config.urls         { tof, mof, bof } — destination URLs
 * @param {Object} config.budget       { tofDay, mofDay, bofDay } — in BRL cents (500 = R$5)
 * @param {Object} config.targeting    { ageMin, ageMax, country, interests }
 */
export async function createFullCampaign(config) {
  const { adAccount } = cfg();
  const slug = config.name.toLowerCase().replace(/\s+/g, "-");

  console.log(`[Meta Ads] Criando campanha: ${config.name}`);

  // ── 1. Campaign ──────────────────────────────────────────
  const campaign = await apiPost(`${adAccount}/campaigns`, {
    name: `[TDO] ${config.name}`,
    objective: "OUTCOME_TRAFFIC",
    status: "PAUSED", // Always start paused — review before activating
    special_ad_categories: [],
  });
  console.log(`[Meta Ads] Campanha criada: ${campaign.id}`);

  // ── 2. Upload images ─────────────────────────────────────
  const carouselImageHashes = [];
  for (const imgPath of config.carouselImages) {
    const hash = await uploadAdImage(imgPath);
    carouselImageHashes.push(hash);
  }

  let storyImageHash = null;
  if (config.storyImage) {
    storyImageHash = await uploadAdImage(config.storyImage);
  }

  // ── 3. Ad Sets + Ads ─────────────────────────────────────
  const results = { campaignId: campaign.id, adSets: [] };

  // TOF
  const tofAdSet = await createAdSet(campaign.id, {
    name: `TOF – ${slug} – frio`,
    objective: "OUTCOME_TRAFFIC",
    budgetCents: config.budget.tofDay,
    targeting: buildTargeting({ ...config.targeting, retarget: false }),
    destinationUrl: config.urls.tof,
  });

  const tofAd = await createCarouselAd(tofAdSet.id, {
    name: `TOF – MacBook Carrossel`,
    imageHashes: carouselImageHashes,
    copy: config.copy.tof,
    destinationUrl: config.urls.tof,
  });

  results.adSets.push({ stage: "TOF", adSetId: tofAdSet.id, adId: tofAd.id });

  // MOF
  const mofAdSet = await createAdSet(campaign.id, {
    name: `MOF – ${slug} – morno`,
    objective: "OUTCOME_TRAFFIC",
    budgetCents: config.budget.mofDay,
    targeting: buildTargeting({ ...config.targeting, retarget: true }),
    destinationUrl: config.urls.mof,
  });

  const mofAd = await createCarouselAd(mofAdSet.id, {
    name: `MOF – MacBook Carrossel`,
    imageHashes: carouselImageHashes,
    copy: config.copy.mof,
    destinationUrl: config.urls.mof,
  });

  results.adSets.push({ stage: "MOF", adSetId: mofAdSet.id, adId: mofAd.id });

  // BOF (story)
  if (storyImageHash) {
    const bofAdSet = await createAdSet(campaign.id, {
      name: `BOF – ${slug} – quente`,
      objective: "OUTCOME_TRAFFIC",
      budgetCents: config.budget.bofDay,
      targeting: buildTargeting({ ...config.targeting, retarget: true, warm: true }),
      destinationUrl: config.urls.bof,
    });

    const bofAd = await createSingleImageAd(bofAdSet.id, {
      name: `BOF – Story Ofertas`,
      imageHash: storyImageHash,
      copy: config.copy.bof,
      destinationUrl: config.urls.bof,
      format: "STORIES",
    });

    results.adSets.push({ stage: "BOF", adSetId: bofAdSet.id, adId: bofAd.id });
  }

  console.log(`[Meta Ads] Campanha completa criada (status PAUSED). Revise e ative no Gerenciador.`);
  console.log(`[Meta Ads] Link: https://business.facebook.com/adsmanager/manage/campaigns?act=${adAccount.replace("act_", "")}`);

  return results;
}

async function uploadAdImage(imagePath) {
  const { adAccount } = cfg();
  const { token } = cfg();
  const url = `${BASE}/${adAccount}/adimages?access_token=${token}`;

  const form = new FormData();
  const fileBuffer = readFileSync(imagePath);
  const blob = new Blob([fileBuffer], { type: "image/png" });
  form.append("filename", blob, basename(imagePath));

  const res = await fetch(url, { method: "POST", body: form });
  const json = await res.json();

  if (json.error) throw new Error(`Meta API: ${json.error.message}`);

  // Response: { images: { filename: { hash, url, ... } } }
  const images = json.images;
  const key = Object.keys(images)[0];
  const hash = images[key].hash;
  console.log(`[Meta Ads] Imagem enviada: ${basename(imagePath)} → hash ${hash}`);
  return hash;
}

async function createAdSet(campaignId, { name, budgetCents, targeting, destinationUrl }) {
  const { adAccount } = cfg();

  const adSet = await apiPost(`${adAccount}/adsets`, {
    name,
    campaign_id: campaignId,
    daily_budget: budgetCents,
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    targeting,
    status: "PAUSED",
    destination_type: "WEBSITE",
  });

  console.log(`[Meta Ads] AdSet criado: ${name} (${adSet.id})`);
  return adSet;
}

async function createCarouselAd(adSetId, { name, imageHashes, copy, destinationUrl }) {
  const { adAccount, pageId } = cfg();

  const childAttachments = imageHashes.map((hash, i) => ({
    link: destinationUrl,
    image_hash: hash,
    name: copy.headline,
    description: i === 0 ? copy.primary.slice(0, 80) : "",
  }));

  const creative = await apiPost(`${adAccount}/adcreatives`, {
    name: `${name} – creative`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        link: destinationUrl,
        message: copy.primary,
        child_attachments: childAttachments,
        call_to_action: { type: copy.cta || "LEARN_MORE", value: { link: destinationUrl } },
        multi_share_end_card: false,
      },
    },
  });

  const ad = await apiPost(`${adAccount}/ads`, {
    name,
    adset_id: adSetId,
    creative: { creative_id: creative.id },
    status: "PAUSED",
  });

  console.log(`[Meta Ads] Ad criado: ${name} (${ad.id})`);
  return ad;
}

async function createSingleImageAd(adSetId, { name, imageHash, copy, destinationUrl, format }) {
  const { adAccount, pageId } = cfg();

  const creative = await apiPost(`${adAccount}/adcreatives`, {
    name: `${name} – creative`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        link: destinationUrl,
        message: copy.primary,
        name: copy.headline,
        image_hash: imageHash,
        call_to_action: { type: copy.cta || "LEARN_MORE", value: { link: destinationUrl } },
      },
    },
  });

  const ad = await apiPost(`${adAccount}/ads`, {
    name,
    adset_id: adSetId,
    creative: { creative_id: creative.id },
    status: "PAUSED",
  });

  console.log(`[Meta Ads] Ad (story) criado: ${name} (${ad.id})`);
  return ad;
}

function buildTargeting({ ageMin = 22, ageMax = 45, country = "BR", interests = [], retarget = false, warm = false }) {
  const base = {
    geo_locations: { countries: [country] },
    age_min: ageMin,
    age_max: ageMax,
  };

  if (!retarget && interests.length > 0) {
    base.interests = interests.map(id => ({ id, name: id }));
  }

  if (retarget || warm) {
    // Retargeting audiences — requires custom audiences set up in the account
    // Add custom_audiences when IDs are available
    // base.custom_audiences = [{ id: "CUSTOM_AUDIENCE_ID" }];
  }

  return base;
}

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Verify credentials and return account info.
 */
export async function verifyCredentials() {
  const { token, pageId, igId, adAccount } = cfg();

  if (!token || !pageId || !igId || !adAccount) {
    const missing = ["META_ACCESS_TOKEN", "META_PAGE_ID", "META_IG_USER_ID", "META_AD_ACCOUNT_ID"]
      .filter(k => !process.env[k]);
    throw new Error(`Faltando variáveis de ambiente: ${missing.join(", ")}`);
  }

  const [page, ig, account] = await Promise.all([
    apiGet(pageId, { fields: "name,id" }),
    apiGet(igId, { fields: "name,username,id" }),
    apiGet(adAccount, { fields: "name,account_status,currency" }),
  ]);

  return {
    page: { id: page.id, name: page.name },
    instagram: { id: ig.id, username: ig.username },
    adAccount: { id: account.id, name: account.name, status: account.account_status, currency: account.currency },
  };
}
