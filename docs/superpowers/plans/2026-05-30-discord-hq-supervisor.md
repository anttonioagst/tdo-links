# Discord HQ Supervisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first functional Discord HQ slice: Discord bot configuration, server setup, private agent reporting, public deal channel routing, and supervisor health checks.

**Architecture:** Add focused Discord modules under `src/discord/` and a focused supervisor module under `src/agents/supervisor.js`. Keep the existing webhook publisher as fallback, but use the bot REST API for channel setup and multi-channel sends. Persist incidents in existing JSON/Postgres state and expose admin routes for setup and manual supervisor checks.

**Tech Stack:** Node 20, native `fetch`, existing `JsonDb`/`PgDb`, BullMQ worker cron, existing `test/run-tests.js`, Railway env vars.

---

### Task 1: Config And State Foundation

**Files:**
- Modify: `src/config.js`
- Modify: `src/db.js`
- Modify: `src/pg-db.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Write failing config/state tests**

Add tests to `test/run-tests.js`:

```js
test("config exposes Discord bot and supervisor settings", () => {
  const config = loadConfig({
    DISCORD_BOT_TOKEN: "bot-token",
    DISCORD_GUILD_ID: "guild-1",
    DISCORD_ADMIN_ROLE_NAME: "Admin TDO",
    DISCORD_SETUP_ENABLED: "true",
    DISCORD_OPS_ENABLED: "true",
    DISCORD_PUBLIC_DEALS_ENABLED: "false",
    SUPERVISOR_ENABLED: "true",
    SUPERVISOR_INTERVAL_MINUTES: "5",
    SUPERVISOR_STALE_TELEGRAM_MINUTES: "90"
  });

  assert.equal(config.discordBotToken, "bot-token");
  assert.equal(config.discordGuildId, "guild-1");
  assert.equal(config.discordAdminRoleName, "Admin TDO");
  assert.equal(config.discordSetupEnabled, true);
  assert.equal(config.discordOpsEnabled, true);
  assert.equal(config.discordPublicDealsEnabled, false);
  assert.equal(config.supervisorEnabled, true);
  assert.equal(config.supervisorIntervalMinutes, 5);
  assert.equal(config.supervisorStaleTelegramMinutes, 90);
});

test("db state includes incidents and discord channel registry defaults", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    assert.deepEqual(db.state.incidents, []);
    assert.deepEqual(db.state.discord, { channels: {}, roles: {}, lastSetupAt: null, lastSetupError: null });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`

Expected: fail because config fields and db defaults are missing.

- [ ] **Step 3: Implement minimal config/state**

In `src/config.js`, add:

```js
discordBotToken: env.DISCORD_BOT_TOKEN || "",
discordGuildId: env.DISCORD_GUILD_ID || "",
discordAdminRoleName: env.DISCORD_ADMIN_ROLE_NAME || "Admin TDO",
discordSetupEnabled: env.DISCORD_SETUP_ENABLED === "true",
discordOpsEnabled: env.DISCORD_OPS_ENABLED === "true",
discordPublicDealsEnabled: env.DISCORD_PUBLIC_DEALS_ENABLED === "true",
supervisorEnabled: env.SUPERVISOR_ENABLED !== "false",
supervisorIntervalMinutes: Number(env.SUPERVISOR_INTERVAL_MINUTES || 5),
supervisorStaleTelegramMinutes: Number(env.SUPERVISOR_STALE_TELEGRAM_MINUTES || 90),
```

In `src/db.js`, add defaults:

```js
incidents: [],
discord: { channels: {}, roles: {}, lastSetupAt: null, lastSetupError: null },
```

and merge them in `normalizeState`.

In `src/pg-db.js`, add `incidents` and `discord` to in-memory state. Persist them in the existing `settings` table as keys `incidents` and `discord` instead of adding new SQL tables in this slice.

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/db.js src/pg-db.js test/run-tests.js
git commit -m "feat: add discord hq state config"
```

### Task 2: Discord REST Client And Server Setup

**Files:**
- Create: `src/discord/client.js`
- Create: `src/discord/setup.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Write failing Discord setup tests**

Add tests:

```js
test("Discord setup creates managed public and private channels without deleting existing channels", async () => {
  const calls = [];
  const existingChannels = [
    { id: "cat-public", name: "📌 INICIO", type: 4 },
    { id: "existing-welcome", name: "boas-vindas", type: 0, parent_id: "cat-public" }
  ];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === "GET") return new Response(JSON.stringify(existingChannels), { status: 200 });
    if (options.method === "POST") return new Response(JSON.stringify({ id: `created-${calls.length}`, name: JSON.parse(options.body).name }), { status: 201 });
    if (options.method === "PATCH") return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response("{}", { status: 200 });
  };
  const db = { state: { discord: { channels: {}, roles: {}, lastSetupAt: null, lastSetupError: null } }, save: async () => {} };
  const result = await setupDiscordServer(db, {
    discordBotToken: "token",
    discordGuildId: "guild",
    discordAdminRoleName: "Admin TDO"
  }, { fetchImpl });

  assert.equal(result.ok, true);
  assert.ok(calls.some(call => call.options.method === "POST"));
  assert.ok(db.state.discord.channels["boas-vindas"]);
  assert.ok(db.state.discord.channels["supervisor"]);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`

Expected: fail because `src/discord/setup.js` does not exist.

- [ ] **Step 3: Implement Discord REST client**

Create `src/discord/client.js` with:

```js
const API_BASE = "https://discord.com/api/v10";

export function createDiscordClient(config, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const token = config.discordBotToken;
  if (!token) throw new Error("DISCORD_BOT_TOKEN not configured");

  async function request(method, path, body) {
    const response = await fetchImpl(`${API_BASE}${path}`, {
      method,
      headers: {
        authorization: `Bot ${token}`,
        "content-type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(payload?.message || `Discord HTTP ${response.status}`);
    }
    return payload;
  }

  return {
    listGuildChannels: (guildId) => request("GET", `/guilds/${guildId}/channels`),
    createGuildChannel: (guildId, body) => request("POST", `/guilds/${guildId}/channels`, body),
    editChannel: (channelId, body) => request("PATCH", `/channels/${channelId}`, body),
    createMessage: (channelId, body) => request("POST", `/channels/${channelId}/messages`, body)
  };
}
```

- [ ] **Step 4: Implement setup module**

Create `src/discord/setup.js` with managed category/channel definitions, no delete behavior, id reuse by name, permission overwrites hiding `TDO OPS` from everyone, and db registry updates.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/discord/client.js src/discord/setup.js test/run-tests.js
git commit -m "feat: add discord server setup agent"
```

### Task 3: Discord Ops Reporter And Deal Routing

**Files:**
- Create: `src/discord/reporter.js`
- Create: `src/discord/deals.js`
- Modify: `src/agents/publisher.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Write failing reporter/routing tests**

Add tests:

```js
test("Discord ops reporter sends agent event to mapped private channel and masks secrets", async () => {
  const sent = [];
  const db = { state: { discord: { channels: { supervisor: "chan-supervisor" } } } };
  const result = await reportAgentEvent(db, { discordOpsEnabled: true, discordBotToken: "token" }, {
    agent: "supervisor",
    severity: "warning",
    title: "Token check",
    message: "Using token abc123",
    data: { token: "secret", offerId: "offer_1" }
  }, { client: { createMessage: async (channelId, body) => sent.push({ channelId, body }) } });

  assert.equal(result.ok, true);
  assert.equal(sent[0].channelId, "chan-supervisor");
  assert.doesNotMatch(JSON.stringify(sent[0].body), /secret/);
});

test("Discord deal routing maps offers to public promotion channels", () => {
  assert.equal(discordDealChannelForOffer({ title: "Notebook Acer Aspire" }), "notebooks");
  assert.equal(discordDealChannelForOffer({ title: "Smart TV LG 55" }), "tvs");
  assert.equal(discordDealChannelForOffer({ title: "Monitor LG Ultragear" }), "monitores");
  assert.equal(discordDealChannelForOffer({ title: "Headset HyperX Cloud" }), "audio-headsets");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`

Expected: fail because reporter/deals modules do not exist.

- [ ] **Step 3: Implement reporter**

Create `src/discord/reporter.js`:

- map agents to private channel names;
- skip when `discordOpsEnabled` false;
- use channel ids from `db.state.discord.channels`;
- redact keys named `token`, `secret`, `key`, `authorization`;
- send concise embeds through Discord client.

- [ ] **Step 4: Implement deal routing**

Create `src/discord/deals.js`:

- export `discordDealChannelForOffer(offer)`;
- export `buildDiscordDealMessage(offer, affiliateUrl)`;
- export `publishDiscordDeal(db, config, offer, options)`.

- [ ] **Step 5: Integrate publisher**

In `src/agents/publisher.js`, after successful Telegram publish and normal Discord publish, call `reportAgentEvent` for operational reporting. Keep failures non-blocking.

- [ ] **Step 6: Run tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/discord/reporter.js src/discord/deals.js src/agents/publisher.js test/run-tests.js
git commit -m "feat: add discord ops reporting"
```

### Task 4: Supervisor Agent

**Files:**
- Create: `src/agents/supervisor.js`
- Modify: `src/worker-main.js`
- Modify: `src/queues/workers.js`
- Modify: `src/server.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Write failing supervisor tests**

Add tests:

```js
test("supervisor detects stale Telegram window and enqueues one recovery", async () => {
  const jobs = [];
  const db = {
    state: {
      offers: [{ id: "offer_ready", title: "Notebook Acer", status: "auto_ready", currentPrice: 3499, previousPrice: 4899, discountPercent: 29, imageUrls: ["x"], createdAt: new Date().toISOString() }],
      publishLog: [],
      incidents: [],
      discord: { channels: {} }
    },
    load: async () => {},
    save: async () => {}
  };
  const result = await runSupervisorCheck(db, {
    supervisorEnabled: true,
    supervisorStaleTelegramMinutes: 60,
    maxPublicationsPerCycle: 4,
    publicationWindowHours: 1,
    minPublicationIntervalMinutes: 15
  }, { creativeQueue: { add: async (...args) => jobs.push(args) }, now: new Date("2026-05-30T15:00:00.000Z") });

  assert.equal(result.incidents.length, 1);
  assert.equal(result.actions.some(action => action.type === "recovery_enqueued_one_offer"), true);
  assert.equal(jobs.length, 1);
});

test("supervisor opens duplicate incident without publishing non-promotions", async () => {
  const db = {
    state: {
      offers: [
        { id: "a", title: "Notebook Acer Aspire 5", status: "auto_ready", currentPrice: 3499, previousPrice: 4899, discountPercent: 29, imageUrls: ["x"], createdAt: new Date().toISOString() },
        { id: "b", title: "Notebook Acer Aspire 5", status: "auto_ready", currentPrice: 3499, previousPrice: 4899, discountPercent: 29, imageUrls: ["x"], createdAt: new Date().toISOString() }
      ],
      publishLog: [],
      incidents: [],
      discord: { channels: {} }
    },
    load: async () => {},
    save: async () => {}
  };
  const result = await runSupervisorCheck(db, { supervisorEnabled: true }, { now: new Date() });
  assert.equal(result.incidents.some(item => item.type === "duplicate_ready_offer"), true);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`

Expected: fail because supervisor module does not exist.

- [ ] **Step 3: Implement supervisor module**

Create `src/agents/supervisor.js`:

- `runSupervisorCheck(db, config, options)`;
- detect stale Telegram window;
- detect duplicate ready offers;
- open/update incidents;
- enqueue max 1 recovery via `enqueuePendingTelegramOffers`;
- report warnings through `reportAgentEvent`;
- never publish non-promotions.

- [ ] **Step 4: Wire worker cron**

In `src/worker-main.js`, schedule supervisor every `SUPERVISOR_INTERVAL_MINUTES`.

In `src/queues/workers.js`, keep existing publication recovery but allow supervisor to be the main periodic owner for incidents.

- [ ] **Step 5: Add admin routes**

In `src/server.js`:

- `POST /api/supervisor/run`;
- `GET /api/supervisor/incidents`;
- `POST /api/discord/setup`.

All mutating routes use existing admin token enforcement.

- [ ] **Step 6: Run tests/build**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/agents/supervisor.js src/worker-main.js src/queues/workers.js src/server.js test/run-tests.js
git commit -m "feat: add supervisor agent"
```

### Task 5: Railway Configuration And Deployment

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document env vars**

Add to `.env.example`:

```env
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_ADMIN_ROLE_NAME=Admin TDO
DISCORD_SETUP_ENABLED=false
DISCORD_OPS_ENABLED=true
DISCORD_PUBLIC_DEALS_ENABLED=false
SUPERVISOR_ENABLED=true
SUPERVISOR_INTERVAL_MINUTES=5
SUPERVISOR_STALE_TELEGRAM_MINUTES=90
```

- [ ] **Step 2: Run verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: document discord supervisor env"
```

- [ ] **Step 4: Deploy**

Push main:

```bash
git push
```

Then verify Railway:

```bash
railway deployment list --service worker --environment production --limit 3
railway deployment list --service tdo-links --environment production --limit 3
curl -fsS https://tdo-links-production.up.railway.app/api/health
```

Expected: both services `SUCCESS`, health returns `ok:true`.

## Self-Review

Spec coverage:

- Discord public promotion area: Task 2 and Task 3.
- Private agent channels: Task 2 and Task 3.
- Bot-based setup: Task 2.
- Supervisor autocorrection: Task 4.
- Admin routes: Task 4.
- Env and deployment: Task 5.

No placeholders remain. Token handling is explicit: implementation reads from env and never stores the exposed token in code or docs.
