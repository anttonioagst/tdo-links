# TDO Links Premium Phase 1 Design

## Context

TDO Links is an affiliate deal operations app for PT-BR campaigns. The current product already has a React admin interface, a Node HTTP backend, JSON persistence, offer scoring, copy generation, affiliate link tracking, Telegram publishing, X acquisition drafts, and basic reports.

The current gap is that the product still behaves like an MVP in several critical areas:

- Offer discovery can fall back to mock data and does not make source quality obvious enough.
- Telegram publishing can silently feel non-functional when credentials or dry-run mode are misconfigured.
- The dashboard uses generic ecommerce labels and some tabs do not yet help manage revenue-producing work.
- Reports are basic and do not produce enough operational guidance.
- Affiliate readiness, validation, score, publishing state, and next actions are spread across the UI instead of forming one clear operating system.

Phase 1 will turn the app into a premium semi-automated affiliate operations cockpit focused on Amazon Brasil, with X/Twitter for acquisition and Telegram for conversion.

## Product Direction

The product should follow a phased hybrid path:

1. Make the real operation work: Amazon candidate discovery, official/manual affiliate link validation, Telegram publishing, tracking, and clear logs.
2. Upgrade the dashboard into a decision cockpit: useful tabs, score, validation, alerts, and recommendations.
3. Add growth intelligence later: A/B testing, best posting times, segmentation, reposting, and stronger revenue estimates.

Phase 1 covers items 1 and 2. Growth features are designed as future-compatible data structures and UI slots, but not fully built yet.

## Phase 1 Goals

- Make Amazon Brasil the first real offer source.
- Keep manual official affiliate links as the publishing authority.
- Allow automatic candidate discovery, but prevent unsafe automatic publishing.
- Make Telegram publishing testable, observable, and reliable.
- Use X/Twitter as an acquisition channel, initially safe to run in dry-run/manual mode.
- Replace generic dashboard sections with affiliate operations language and actions.
- Add a compound opportunity score that guides automation.
- Make each tab useful for managing affiliate revenue work.

## Non-Goals

- No multi-store expansion in Phase 1 beyond preserving Mercado Livre compatibility already present.
- No promise of real sales/revenue attribution unless imported from affiliate reports.
- No aggressive autopilot that publishes every high-scoring candidate without validation.
- No full X/Twitter live publishing unless credentials and provider integration are explicitly added later.
- No database migration away from JSON storage in this phase.

## Core Workflow

The operating workflow is:

```text
Discover candidate -> Validate offer -> Score opportunity -> Generate copy -> Review or auto-approve -> Publish -> Track clicks -> Learn
```

Each offer and draft should make its current stage obvious. The UI should always answer:

- Is this offer real and recent?
- Is the affiliate link official and ready?
- Why did the system assign this score?
- Can this be published automatically?
- If not, what exactly must be fixed?
- What happened the last time the system tried to publish it?

## Automation Policy

The default operating mode is semi-automatic.

- Green offers can be published automatically to Telegram if all gates pass.
- Yellow offers go to human review.
- Red offers are blocked and show the reason.

Green means:

- Amazon candidate was discovered or manually added.
- Price was captured recently.
- Product appears available.
- Affiliate link is official/manual or a valid configured tracking tag is present.
- Compliance validation passes.
- Opportunity score meets the auto-publish threshold.
- Telegram integration is configured and dry-run policy allows publishing.

Manual approval can promote a yellow offer, but blocked offers require fixing the blocking reason first.

## Backend Design

### Amazon Deal Scout

`src/scrapers.js` should evolve from a mock-first scraper into a source-aware scout.

The scout returns candidates with metadata:

- `source`: `amazon_search`, `manual`, or `mock`
- `sourceUrl`
- `asin`
- `title`
- `currentPrice`
- `previousPrice`
- `discountPercent`
- `imageUrl` and `imageUrls`
- `rating`
- `reviewCount`
- `inStock`
- `scrapedAt`
- `sourceConfidence`
- `sourceWarnings`

Mock fallback may remain for development, but the scrape response and UI must clearly show when mock fallback was used.

### Offer Validator

Add a validation layer that produces a normalized validation result for each offer:

- `validationStatus`: `ready`, `needs_review`, or `blocked`
- `validationReasons`: machine-readable strings
- `validationSummary`: short PT-BR explanation for the UI
- `priceValidatedAt`
- `affiliateValidatedAt`
- `publishable`

Validation checks:

- Affiliate readiness.
- Amazon manual SiteStripe or `amzn.to` links when required.
- Price exists and is recent.
- Product image exists when possible.
- Product appears in stock.
- Compliance rules pass.
- Amazon dynamic price warning is respected.

### Opportunity Score

Replace the current simple score with a compound score while preserving thresholds.

Score components:

- Reliability: affiliate link, price recency, source confidence, stock, compliance.
- Attractiveness: discount, price range, rating, review count, product quality signals.
- Potential: estimated commission category, ticket size, category demand.
- Performance: clicks by offer/category/channel/hour when available.

The backend should expose score breakdowns so the UI can explain why an offer is green, yellow, or red.

### Publishing Control Plane

Telegram publishing needs explicit diagnostics and logs.

Add or expand API output for:

- Telegram dry-run status.
- Bot token configured.
- Chat ID configured.
- Last publish attempt.
- Provider message ID.
- Provider error detail.
- Drafts skipped and why.

`POST /api/run/publish` should return a detailed result, not just a count:

- published drafts
- dry-run drafts
- failed drafts
- skipped drafts
- per-draft detail

### X Acquisition

X should be treated as acquisition, not the main conversion channel.

Phase 1 behavior:

- Generate X acquisition drafts for top offers or curated campaigns.
- Avoid direct affiliate pressure as the default.
- Prefer driving users to Telegram/profile.
- Keep dry-run/manual mode until a real X integration is intentionally configured.
- Track draft status and publish logs the same way as Telegram.

### Reports

Reports should become operational recommendations. A report should include:

- What happened.
- Why it matters.
- Which offers/campaigns need action.
- Recommended next action.
- Supporting metric.

Examples:

- "3 offers have high score but no official affiliate link."
- "Telegram is in dry-run, so published counts are not real sends."
- "SSD offers have the best click rate in the last 30 days."
- "Two drafts failed because Telegram credentials are missing."

## Frontend Design

The React app should keep the existing admin-dashboard foundation but replace generic ecommerce copy and passive panels with affiliate operations UI.

### Navigation

Recommended tabs:

- Dashboard
- Operacao
- Ofertas
- Campanhas
- Relatorios IA
- Configuracao

If Phase 1 scope needs to stay smaller, `Campanhas` can be represented inside `Operacao` until Phase 2.

### Dashboard

Replace generic labels such as "Monthly Sales", "Monthly Target", "Customers Demographic", and "Recent Orders".

Dashboard sections:

- `Pronto para publicar`
- `Bloqueado por link`
- `Enviado hoje`
- `Cliques 24h`
- `Melhor oportunidade`
- `Proxima acao`
- `Saude da operacao`
- `Funil de ofertas`

The primary dashboard purpose is to tell the operator what to do next.

### Operacao

Use a Kanban-style queue with stages:

- `Candidato`
- `Validando`
- `Revisao`
- `Pronto`
- `Publicado`
- `Erro`

Each card should show:

- Product image.
- Store.
- Price.
- Discount.
- Score.
- Validation state.
- Affiliate readiness.
- Channel.
- Primary action.
- Last error or warning.

### Ofertas

This tab should be a dense management table with filters:

- Source.
- Store.
- Category.
- Score range.
- Validation state.
- Affiliate ready or pending.
- Published or unpublished.
- Click performance.
- Search query.

Rows should show:

- Product.
- Price and discount.
- Score and score breakdown access.
- Affiliate status.
- Validation status.
- Click count.
- Last scraped/validated time.
- Open original/link/tracked URL.

### Relatorios IA

This tab should not only list generated reports. It should show:

- Current recommendations.
- Evidence for each recommendation.
- Impact estimate.
- Action button when possible.
- Historical reports.

Initial recommendations can be deterministic from local data; no LLM is required in Phase 1.

### Configuracao

Configuration should become an integration health center:

- Telegram status: token, chat ID, dry-run, test send, last error.
- Amazon status: default tag, Telegram tag, X tag, admin tag, manual link policy.
- Scout status: scraper mode, fallback mock status, search URLs.
- Automation: mode, thresholds, intervals.
- Compliance: disclosure text and warning policy.

## API Changes

Add or extend endpoints:

- `GET /api/diagnostics`: include integration health, source mode, dry-run status, and last publish attempts.
- `POST /api/integrations/telegram/test`: send a test message or dry-run diagnostic.
- `POST /api/run/scrape`: return source details, inserted count, skipped duplicates, errors, and mock fallback flag.
- `POST /api/run/publish`: return per-draft publish results.
- `POST /api/offers/manual`: create or enrich an offer from a pasted Amazon/SiteStripe URL.
- `POST /api/offers/:id/validate`: refresh validation state for one offer.
- `GET /api/recommendations`: return actionable recommendations derived from current state.

Existing endpoints should continue working where possible.

## Data Model Additions

Offer additions:

- `source`
- `sourceConfidence`
- `sourceWarnings`
- `asin`
- `validationStatus`
- `validationReasons`
- `validationSummary`
- `priceValidatedAt`
- `affiliateValidatedAt`
- `publishable`
- `scoreBreakdown`

Draft additions:

- `publishAttempts`
- `lastPublishResult`
- `campaignId` optional
- `variantGroupId` optional for future A/B support

State additions:

- `integrations`
- `recommendations`
- `campaigns` as an empty array reserved for Phase 2; Phase 1 may attach `campaignId` to drafts but does not need campaign management screens.

## Error Handling

Errors should be visible and actionable.

- Missing Telegram token should not look like a successful publish.
- Dry-run publishes should be labeled as dry-run in logs and UI.
- Amazon scrape failures should show source URL and reason.
- Mock fallback should be visible as a warning.
- Invalid affiliate links should explain accepted formats.
- Blocked offers should show the blocking reasons on the card/table row.

## Testing

Phase 1 should add focused tests for:

- Validation status transitions.
- Compound score breakdown.
- Telegram diagnostics and dry-run behavior.
- Publish pipeline result details.
- Manual Amazon affiliate link handling.
- Scrape response metadata when fallback mock is used.
- Recommendation generation from known state.

Existing tests should continue passing.

## Rollout Plan

Implementation should proceed in this order:

1. Backend diagnostics and detailed publish results.
2. Offer validation layer and score breakdown.
3. Amazon scout metadata and mock fallback visibility.
4. Manual offer/link workflow.
5. Frontend premium copy, dashboard, operation queue, and configuration health.
6. Deterministic recommendations and improved reports.
7. Tests and final polish.

This order makes the functional gaps visible before polishing the UI, while still delivering a premium experience in the same phase.

## Acceptance Criteria

Phase 1 is complete when:

- The dashboard no longer reads like a generic ecommerce template.
- The operator can see whether Telegram is truly configured and whether dry-run is active.
- Publishing returns per-draft results in the UI.
- Amazon candidates clearly show whether they came from real search, manual input, or mock fallback.
- Offers have validation status and score breakdown.
- Semi-automatic publishing only sends green Telegram drafts.
- Yellow offers require review.
- Red offers show blocking reasons.
- Reports include actionable recommendations backed by current app data.
- Tests cover the main backend decision logic.
