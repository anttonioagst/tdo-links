import pg from "pg";

const { Pool } = pg;

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS offers (
  id text PRIMARY KEY,
  store text, source text, asin text, title text,
  current_price numeric, previous_price numeric, discount_percent integer,
  original_url text, affiliate_url text, affiliate_source text,
  affiliate_ready boolean DEFAULT false,
  image_url text, image_urls jsonb DEFAULT '[]',
  generated_image_path text, generated_at timestamptz,
  telegram_image_file_id text,
  category text, rating numeric, review_count integer,
  in_stock boolean DEFAULT true, status text, score integer,
  source_confidence numeric, source_warnings jsonb DEFAULT '[]',
  store_reputation text, scraped_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS telegram_image_file_id text;
CREATE TABLE IF NOT EXISTS drafts (
  id text PRIMARY KEY,
  offer_id text REFERENCES offers(id) ON DELETE CASCADE,
  channel text, status text, text text,
  short_code text UNIQUE, rejection_reason text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS clicks (
  id text PRIMARY KEY,
  offer_id text, short_code text, channel text,
  timestamp timestamptz DEFAULT now(),
  user_agent text, referer text, country text
);
CREATE TABLE IF NOT EXISTS publish_log (
  id text PRIMARY KEY,
  draft_id text, offer_id text, channel text, result jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE publish_log ADD COLUMN IF NOT EXISTS offer_id text;
CREATE TABLE IF NOT EXISTS price_history (
  id serial PRIMARY KEY,
  offer_id text, price numeric, recorded_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb
);
CREATE TABLE IF NOT EXISTS offer_images (
  offer_id text NOT NULL,
  angle integer NOT NULL,
  image_data bytea NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (offer_id, angle)
);
`;

const OFFER_COLS = [
  "id", "store", "source", "asin", "title",
  "current_price", "previous_price", "discount_percent",
  "original_url", "affiliate_url", "affiliate_source", "affiliate_ready",
  "image_url", "image_urls", "generated_image_path", "generated_at",
  "telegram_image_file_id",
  "category", "rating", "review_count", "in_stock", "status", "score",
  "source_confidence", "source_warnings", "store_reputation", "scraped_at",
  "created_at", "updated_at"
];

const DRAFT_COLS = [
  "id", "offer_id", "channel", "status", "text",
  "short_code", "rejection_reason", "created_at", "updated_at"
];

const CLICK_COLS = [
  "id", "offer_id", "short_code", "channel",
  "timestamp", "user_agent", "referer", "country"
];

const LOG_COLS = ["id", "draft_id", "offer_id", "channel", "result", "created_at"];

function offerToRow(o) {
  return {
    id: o.id, store: o.store || null, source: o.source || null,
    asin: o.asin || null, title: o.title || null,
    current_price: o.currentPrice != null ? String(o.currentPrice) : null,
    previous_price: o.previousPrice != null ? String(o.previousPrice) : null,
    discount_percent: o.discountPercent ?? null,
    original_url: o.originalUrl || null, affiliate_url: o.affiliateUrl || null,
    affiliate_source: o.affiliateSource || null,
    affiliate_ready: Boolean(o.affiliateReady),
    image_url: o.imageUrl || null,
    image_urls: JSON.stringify(o.imageUrls || []),
    generated_image_path: o.generatedImagePath || null,
    generated_at: o.generatedAt || null,
    telegram_image_file_id: o.telegramImageFileId || null,
    category: o.category || null,
    rating: o.rating != null ? String(o.rating) : null,
    review_count: o.reviewCount ?? null,
    in_stock: o.inStock !== false,
    status: o.status || null, score: o.score ?? null,
    source_confidence: o.sourceConfidence != null ? String(o.sourceConfidence) : null,
    source_warnings: JSON.stringify(o.sourceWarnings || []),
    store_reputation: o.storeReputation || null,
    scraped_at: o.scrapedAt || null,
    created_at: o.createdAt || null, updated_at: o.updatedAt || null
  };
}

function rowToOffer(r) {
  return {
    id: r.id, store: r.store, source: r.source, asin: r.asin, title: r.title,
    currentPrice: r.current_price != null ? Number(r.current_price) : null,
    previousPrice: r.previous_price != null ? Number(r.previous_price) : null,
    discountPercent: r.discount_percent,
    originalUrl: r.original_url, affiliateUrl: r.affiliate_url,
    affiliateSource: r.affiliate_source, affiliateReady: r.affiliate_ready,
    imageUrl: r.image_url,
    imageUrls: Array.isArray(r.image_urls) ? r.image_urls : JSON.parse(r.image_urls || "[]"),
    generatedImagePath: r.generated_image_path,
    generatedAt: r.generated_at?.toISOString?.() ?? r.generated_at,
    telegramImageFileId: r.telegram_image_file_id || null,
    category: r.category, rating: r.rating != null ? Number(r.rating) : null,
    reviewCount: r.review_count, inStock: r.in_stock,
    status: r.status, score: r.score,
    sourceConfidence: r.source_confidence != null ? Number(r.source_confidence) : null,
    sourceWarnings: Array.isArray(r.source_warnings) ? r.source_warnings : JSON.parse(r.source_warnings || "[]"),
    storeReputation: r.store_reputation,
    scrapedAt: r.scraped_at?.toISOString?.() ?? r.scraped_at,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at
  };
}

function draftToRow(d) {
  return {
    id: d.id, offer_id: d.offerId, channel: d.channel, status: d.status,
    text: d.text, short_code: d.shortCode, rejection_reason: d.rejectionReason || null,
    created_at: d.createdAt || null, updated_at: d.updatedAt || null
  };
}

function rowToDraft(r) {
  return {
    id: r.id, offerId: r.offer_id, channel: r.channel, status: r.status,
    text: r.text, shortCode: r.short_code, rejectionReason: r.rejection_reason,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at
  };
}

function clickToRow(c) {
  return {
    id: c.id, offer_id: c.offerId, short_code: c.shortCode, channel: c.channel,
    timestamp: c.timestamp || null, user_agent: c.userAgent || null,
    referer: c.referer || null, country: c.country || null
  };
}

function logToRow(l) {
  return {
    id: l.id, draft_id: l.draftId, offer_id: l.offerId || null, channel: l.channel,
    result: JSON.stringify(l.result || {}),
    created_at: l.createdAt || null
  };
}

async function batchUpsert(client, table, rows, cols, conflictCol) {
  if (!rows.length) return;
  const updateCols = cols.filter(c => c !== conflictCol && c !== "created_at");
  const params = [];
  const placeholders = rows.map((row) => {
    const start = params.length + 1;
    cols.forEach(c => params.push(row[c] ?? null));
    return `(${cols.map((_, i) => `$${start + i}`).join(", ")})`;
  }).join(", ");
  const colList = cols.map(c => `"${c}"`).join(", ");
  const updateSet = updateCols.map(c => `"${c}" = excluded."${c}"`).join(", ");
  await client.query(
    `INSERT INTO "${table}" (${colList}) VALUES ${placeholders}
     ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateSet}`,
    params
  );
}

async function batchInsertIgnore(client, table, rows, cols, conflictCol) {
  if (!rows.length) return;
  const params = [];
  const placeholders = rows.map((row) => {
    const start = params.length + 1;
    cols.forEach(c => params.push(row[c] ?? null));
    return `(${cols.map((_, i) => `$${start + i}`).join(", ")})`;
  }).join(", ");
  const colList = cols.map(c => `"${c}"`).join(", ");
  await client.query(
    `INSERT INTO "${table}" (${colList}) VALUES ${placeholders}
     ON CONFLICT ("${conflictCol}") DO NOTHING`,
    params
  );
}

export async function saveOfferImages(pool, offerId, buffers) {
  if (!pool || !buffers.length) return;
  const client = await pool.connect();
  try {
    for (let i = 0; i < buffers.length; i++) {
      await client.query(
        `INSERT INTO offer_images (offer_id, angle, image_data)
         VALUES ($1, $2, $3)
         ON CONFLICT (offer_id, angle) DO UPDATE SET image_data = excluded.image_data, created_at = now()`,
        [offerId, i + 1, buffers[i]]
      );
    }
  } finally {
    client.release();
  }
}

export async function loadOfferImages(pool, offerId) {
  if (!pool) return [];
  const { rows } = await pool.query(
    "SELECT image_data FROM offer_images WHERE offer_id = $1 ORDER BY angle",
    [offerId]
  );
  return rows.map(r => r.image_data);
}

export class PgDb {
  constructor(databaseUrl) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    this.state = {
      offers: [], drafts: [], clicks: [], experiments: [],
      reports: [], recommendations: [], campaigns: [], incidents: [],
      discord: { channels: {}, roles: {}, lastSetupAt: null, lastSetupError: null },
      integrations: { discord: { webhookUrl: "", enabled: false, dryRun: true, lastTest: null, lastError: null } },
      discovery: { amazon: { enabled: true, intervalHours: 2, minScore: 70, maxCandidatesPerRun: 10, sourceUrls: [], searchTerms: [], lastRun: null, nextRunAt: null } },
      settings: { mode: "limited", autoPublishThreshold: 85, reviewThreshold: 70 },
      publishLog: [], priceHistory: {}
    };
  }

  async load() {
    await this.pool.query(CREATE_TABLES_SQL);

    const [offerRes, draftRes, clickRes, logRes, histRes, settingRes] = await Promise.all([
      this.pool.query("SELECT * FROM offers ORDER BY created_at DESC"),
      this.pool.query("SELECT * FROM drafts ORDER BY created_at DESC"),
      this.pool.query("SELECT * FROM clicks ORDER BY timestamp DESC LIMIT 500"),
      this.pool.query("SELECT * FROM publish_log ORDER BY created_at DESC LIMIT 100"),
      this.pool.query("SELECT * FROM price_history ORDER BY recorded_at DESC"),
      this.pool.query("SELECT key, value FROM settings")
    ]);

    this.state.offers = offerRes.rows.map(rowToOffer);
    this.state.drafts = draftRes.rows.map(rowToDraft);
    this.state.clicks = clickRes.rows.map(r => ({
      id: r.id, offerId: r.offer_id, shortCode: r.short_code, channel: r.channel,
      timestamp: r.timestamp?.toISOString?.() ?? r.timestamp,
      userAgent: r.user_agent, referer: r.referer, country: r.country
    }));
    this.state.publishLog = logRes.rows.map(r => ({
      id: r.id, draftId: r.draft_id, offerId: r.offer_id, channel: r.channel, result: r.result,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at
    }));

    this.state.priceHistory = {};
    for (const r of histRes.rows) {
      if (!this.state.priceHistory[r.offer_id]) this.state.priceHistory[r.offer_id] = [];
      this.state.priceHistory[r.offer_id].push({ price: Number(r.price), timestamp: r.recorded_at?.toISOString?.() ?? r.recorded_at });
    }

    for (const r of settingRes.rows) {
      if (r.key === "app") Object.assign(this.state.settings, r.value);
      if (r.key === "discovery") this.state.discovery = { ...this.state.discovery, ...r.value };
      if (r.key === "integrations") this.state.integrations = { ...this.state.integrations, ...r.value };
      if (r.key === "incidents") this.state.incidents = Array.isArray(r.value) ? r.value : [];
      if (r.key === "discord") this.state.discord = { ...this.state.discord, ...r.value };
    }

    return this.state;
  }

  async save() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await batchUpsert(client, "offers", this.state.offers.map(offerToRow), OFFER_COLS, "id");
      await batchUpsert(client, "drafts", this.state.drafts.map(draftToRow), DRAFT_COLS, "id");
      await batchInsertIgnore(client, "clicks", this.state.clicks.map(clickToRow), CLICK_COLS, "id");
      await batchInsertIgnore(client, "publish_log", this.state.publishLog.map(logToRow), LOG_COLS, "id");

      const priceOfferIds = Object.keys(this.state.priceHistory);
      if (priceOfferIds.length) {
        await client.query(`DELETE FROM price_history WHERE offer_id = ANY($1)`, [priceOfferIds]);
        const priceRows = priceOfferIds.flatMap(offerId =>
          (this.state.priceHistory[offerId] || []).map(e => ({ offer_id: offerId, price: e.price, recorded_at: e.timestamp }))
        );
        if (priceRows.length) {
          const params = [];
          const ph = priceRows.map(r => {
            const s = params.length + 1;
            params.push(r.offer_id, r.price, r.recorded_at);
            return `($${s}, $${s + 1}, $${s + 2})`;
          }).join(", ");
          await client.query(`INSERT INTO price_history (offer_id, price, recorded_at) VALUES ${ph}`, params);
        }
      }

      await client.query(`
        INSERT INTO settings (key, value) VALUES
          ('app', $1), ('discovery', $2), ('integrations', $3), ('incidents', $4), ('discord', $5)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value
      `, [
        JSON.stringify(this.state.settings),
        JSON.stringify(this.state.discovery),
        JSON.stringify(this.state.integrations),
        JSON.stringify(this.state.incidents || []),
        JSON.stringify(this.state.discord || { channels: {}, roles: {}, lastSetupAt: null, lastSetupError: null })
      ]);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  nextId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
