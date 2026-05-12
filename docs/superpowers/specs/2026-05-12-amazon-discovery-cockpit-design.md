# Amazon Discovery Cockpit Design

## Context

TDO Links already has the Phase 1 premium operations foundation: offer validation, compound scoring, affiliate link readiness, Telegram diagnostics, operational recommendations, manual Amazon offers, and a React dashboard oriented around affiliate operations.

The next operational bottleneck is discovery. The operator needs a steady stream of promising Amazon Brasil candidates in the cockpit without allowing unsafe automatic publishing. Discovery should reduce manual hunting, but the official affiliate link remains a human-controlled gate before any Telegram send.

## Goal

Build a hybrid Amazon discovery flow for the operations cockpit:

- The dashboard lets the operator configure Amazon URLs and search terms.
- The system runs discovery automatically every 2 hours.
- The operator can also trigger discovery manually from the dashboard.
- The system keeps only the best candidates per cycle using score and volume limits.
- Discovered candidates enter the operation queue blocked until an official manual affiliate link is added.

## Non-Goals

- Do not publish discovered candidates automatically.
- Do not treat generated Amazon tracking-tag links as official enough for this feature.
- Do not add a database migration away from the existing JSON store.
- Do not add a full campaign optimization engine, A/B testing, or revenue attribution in this iteration.
- Do not expand beyond Amazon discovery except preserving existing Mercado Livre compatibility.

## Product Decisions

The approved approach is a controlled hybrid:

- Discovery sources are configured in the dashboard, not only through environment variables.
- Sources include both Amazon URLs and Amazon search terms.
- The default schedule is every 2 hours.
- The default minimum score is 70.
- The default accepted candidate limit is 10 per cycle.
- Candidates without an official manual affiliate link are blocked from publishing.
- If no URLs or terms are configured, scheduled discovery is a healthy no-op and records that there were no sources.
- The same discovery service supports scheduler, manual dashboard action, and future external cron calls.

## User Experience

### Configuration

The `Configuracao` view should include a `Descoberta Amazon` section with:

- Editable list of Amazon source URLs.
- Editable list of Amazon search terms.
- Interval in hours, defaulting to 2.
- Minimum candidate score, defaulting to 70.
- Maximum accepted candidates per cycle, defaulting to 10.
- Enabled/disabled switch for automatic discovery.
- Last run status: started time, finished time, accepted candidates, duplicate candidates, rejected candidates, and error count.
- Next scheduled run time when automatic discovery is enabled.
- `Buscar agora` action for a manual run.

### Operation Queue

Discovered candidates should appear in the operation cockpit with:

- Source label: URL or search term.
- Amazon ASIN when available.
- Score and the main score drivers.
- Validation status showing that the official affiliate link is pending.
- Primary action to add the official affiliate link.
- Secondary action to discard/archive the candidate.

The UI should make it obvious that discovery creates opportunities, not publishable offers.

## Backend Design

### Discovery Settings

Extend persisted state with a `discovery` object:

```js
{
  amazon: {
    enabled: true,
    intervalHours: 2,
    minScore: 70,
    maxCandidatesPerRun: 10,
    sourceUrls: [],
    searchTerms: [],
    lastRun: null,
    nextRunAt: null
  }
}
```

Existing deployments should receive these defaults through `db.js` state normalization.

### Discovery Service

Create a focused module, `src/discovery.js`, responsible for:

- Reading discovery settings from state.
- Building Amazon source requests from URLs and terms.
- Calling the existing scraper/parsing layer.
- Normalizing candidates to the existing offer shape.
- Deduplicating by ASIN first, then canonical URL.
- Applying validation and detailed scoring.
- Filtering candidates below `minScore`.
- Sorting by score descending.
- Accepting at most `maxCandidatesPerRun`.
- Inserting accepted candidates into `db.state.offers`.
- Recording a run summary.

The module should expose a high-level function such as `runAmazonDiscovery(db, config, options)`. `options.manual` can distinguish dashboard-triggered runs from scheduled runs, but behavior should otherwise be the same.

### Candidate State

Accepted candidates should use the existing offer model with discovery metadata:

```js
{
  source: "amazon_discovery",
  discoverySourceType: "url" | "term",
  discoverySource: "...",
  asin: "...",
  affiliateSource: "",
  affiliateReady: false,
  validationStatus: "blocked",
  validationReasons: ["affiliate_not_ready", "amazon_manual_link_required"],
  publishable: false
}
```

If a discovered candidate later receives a manual official affiliate link, existing validation and scoring refresh paths should turn it into a normal ready/review offer according to the current rules.

### Scheduler

Add a small scheduler layer in the running Node app:

- It checks whether discovery is enabled.
- It runs when `nextRunAt` is due.
- It updates `lastRun` and `nextRunAt`.
- It should avoid overlapping runs with an in-memory lock.
- It should not crash the app if one source fails.

The scheduler should call the same discovery service used by the manual API. Future Railway/Cron usage can call the manual endpoint or a dedicated endpoint without changing discovery internals.

### API

Add or extend endpoints:

- `GET /api/state`: include discovery settings and last run summary.
- `PUT /api/discovery/amazon/settings`: update source URLs, search terms, interval, min score, max candidates, and enabled flag.
- `POST /api/discovery/amazon/run`: run discovery now and return a detailed run summary.

Mutating routes must keep the existing admin-token protection.

## Error Handling and Observability

Each run summary should include:

- Run id.
- Trigger: `scheduled` or `manual`.
- Started and finished timestamps.
- Source count.
- Candidate count before filtering.
- Accepted count.
- Duplicate count.
- Rejected low-score count.
- Error count.
- Per-source details with status and short error messages.

Source-level failures should not fail the entire run when other sources succeed. A run only fails globally when no discovery work can be attempted due to invalid settings or an unexpected service-level error.

When no source URLs or search terms are configured, a manual or scheduled run should return a successful summary with zero accepted candidates and a clear `no_sources_configured` reason. This keeps first deploys calm while the operator is still setting up discovery.

## Testing

Add focused Node tests for:

- Default discovery settings are present after DB load.
- Updating discovery settings persists valid URLs, terms, thresholds, and enabled state.
- Manual discovery creates blocked Amazon candidates from mocked scraper candidates.
- Candidates without official affiliate links remain unpublishable.
- Deduplication ignores existing ASIN/canonical URL candidates.
- Score filtering rejects candidates below 70 by default.
- Per-run limit accepts at most 10 candidates by default.
- Run summaries include accepted, duplicate, rejected, and error counts.
- Scheduler skips runs before `nextRunAt` and runs after it is due.

Frontend tests are not required in this codebase today, but backend API tests should verify the state shape consumed by the dashboard.

## Implementation Boundaries

Keep the implementation aligned with current project patterns:

- Use the existing Node HTTP server and JSON persistence.
- Reuse `src/scrapers.js`, `src/validation.js`, and `src/scoring.js`.
- Keep the new discovery logic isolated in a small backend module.
- Keep UI changes inside `client/src/App.jsx` and existing styles.
- Avoid unrelated refactors.

## Acceptance Criteria

- The operator can configure Amazon URLs and terms in the dashboard.
- Automatic discovery is enabled by default on a 2-hour interval.
- The operator can trigger discovery manually.
- A discovery run inserts only high-scoring candidates, default score 70 or higher, maximum 10 per run.
- Discovered candidates are visible in the operation queue.
- Discovered candidates cannot publish until a manual official affiliate link is added.
- Last-run and next-run discovery status are visible in configuration/state.
- Existing tests continue passing, with new discovery tests added.
