# TDO Design System and Full App Redesign Design

## Context

TDO Links is evolving from an MVP-style affiliate admin into a premium operations product for Amazon Brasil discovery, offer validation, official affiliate link review, Telegram publishing, click tracking, and AI-assisted recommendations.

The app already has the core operational foundation:

- Amazon discovery settings and scheduled/manual discovery.
- Offer validation and affiliate readiness gates.
- Compound opportunity scoring with score breakdowns.
- Telegram diagnostics and publication actions.
- React dashboard views for overview, operation, offers, reports, and configuration.

The next bottleneck is product quality. The current UI works, but it still feels like a generic admin template. A full redesign should not start by repainting screens one by one. It should first create a reusable design system that becomes the anchor for every redesigned view.

## Approved Direction

The approved visual direction from brainstorming is:

- General direction: clear executive cockpit.
- First screen: performance first.
- Navigation: hybrid command center.
- Visual language: premium graphite navigation with vivid accents and a light primary workspace.
- Density model: hybrid.

The design should feel serious, fast, and premium. It should help the operator know where revenue opportunities are, which offers are blocked, which actions are safe, and what to do next.

## Goals

- Create a TDO-specific design system before redesigning all screens.
- Replace the generic dashboard feel with a product identity built for affiliate operations.
- Keep the app efficient for daily work, not just attractive for demos.
- Make performance, opportunity, validation status, and next actions visible across the app.
- Redesign the full app in incremental commits after the design system is in place.
- Preserve existing backend behavior and data contracts unless a later implementation plan explicitly changes them.

## Non-Goals

- Do not build a marketing landing page.
- Do not redesign by adding decorative hero sections.
- Do not switch the whole app to a dark interface.
- Do not add new business features during the design-system foundation unless they are required to represent existing data.
- Do not migrate persistence or backend architecture as part of this redesign.
- Do not create unrelated refactors outside the UI surface needed by the redesign.

## Product Principle

The app should answer one operational question on every screen:

> What is the best next move to generate safe affiliate traffic?

This means every redesigned surface should make at least one of these visible:

- Performance signal.
- Opportunity signal.
- Publishing readiness.
- Blocking reason.
- Recommended action.
- Recent system activity.

## Design System Foundation

The new design system should be implemented as reusable frontend primitives inside the existing React/Tailwind structure.

### Tokens

Define TDO tokens for:

- Color roles.
- Typography roles.
- Spacing rhythm.
- Border radius.
- Elevation and borders.
- Component density.
- Status and channel semantics.

Recommended visual roles:

- `ink`: deep graphite for command rail and high-emphasis text.
- `surface`: main app background, light neutral.
- `panel`: primary white panels.
- `panel-muted`: subtle nested/secondary surfaces.
- `accent-blue`: primary action and performance signal.
- `accent-green`: revenue, ready, improvement.
- `accent-amber`: review, attention, pending official link.
- `accent-red`: blocked, failed, unsafe.
- `accent-cyan`: automation, discovery, AI.

The palette should avoid becoming one-note. Graphite is the anchor, but the workspace should remain light and the accents should distinguish operational meaning.

### Typography

Use the existing Outfit font unless implementation discovers a concrete reason to change it.

Typography should be tighter than a marketing page:

- Page titles should be clear but not oversized.
- Cards and panels should use compact headings.
- Operational tables and cards should prioritize scan speed.
- Long explanatory text should be rare inside the app.

### Density

Support two density modes by component convention, not as a user setting at first:

- `comfortable`: used for Home Performance and AI/Reports.
- `compact`: used for Operation and Offers.

The same component family can expose compact variants for repeated operational content.

## Core Components

### AppShell

Owns global layout:

- Fixed or sticky graphite command rail.
- Main light workspace.
- Contextual top bar.
- Responsive mobile navigation.
- Toast area.
- Global search position.

### CommandRail

Replaces the current large expandable sidebar with a compact command-center rail.

Required behavior:

- Icon-first navigation with tooltips.
- Active state with vivid accent and label on wider screens.
- Sections for Performance, Operation, Offers, AI, and Config.
- Mobile drawer or bottom-safe navigation pattern.

The command rail should feel like part of the product identity, not a generic collapsed sidebar.

### TopContextBar

Changes based on active view.

Shows:

- View title.
- Short operational subtitle.
- Primary action for the current view.
- Search or filter affordance.
- Health/status indicator when relevant.

Examples:

- Performance: "Buscar oportunidades" or "Atualizar dados".
- Operation: "Publicar elegíveis".
- Offers: "Adicionar oferta" or "Recalcular afiliados".
- AI: "Gerar análise".
- Config: "Testar Telegram" when diagnostics need attention.

### MetricTile

Compact metric card for KPIs.

Supports:

- Value.
- Label.
- Trend or badge.
- Tone.
- Optional sparkline or mini bar.
- Click target when it leads to a filtered view.

### InsightPanel

Used for recommendations and next moves.

Should avoid generic text blocks. Each insight needs:

- Severity/tone.
- Short title.
- Why it matters.
- Suggested action.
- Optional supporting metric.

### StatusBadge

Central badge system for:

- Ready.
- Review.
- Blocked.
- Published.
- Dry-run.
- Discovery.
- AI-generated.
- Official link pending.
- Telegram ready/error.

Badges must use consistent color meaning across every screen.

### ActionButton

Reusable button family:

- Primary.
- Secondary.
- Outline.
- Danger.
- Ghost icon button.

Icon buttons should use lucide icons with labels/tooltips where the meaning is not obvious.

### OfferCard

Compact repeated item for operational queues.

Shows:

- Offer title.
- Price and discount.
- Score.
- Source/discovery label.
- Affiliate readiness.
- Validation summary.
- Primary next action.

### DataTable

Reusable table for Offers and performance lists.

Supports:

- Sticky header when useful.
- Compact rows.
- Sort affordances.
- Status cells.
- Row actions.
- Empty state.
- Mobile fallback to compact cards.

### FormField

Reusable field wrapper for Config and affiliate-link editing.

Supports:

- Label.
- Help text.
- Error text.
- Disabled/loading state.
- Text input, textarea, select, checkbox/toggle, number input.

## Full App Redesign

### Performance Home

The app opens on performance.

Primary goal:

- Show where attention and traffic should go next.

Recommended layout:

- Top context bar with period selector and primary refresh/discovery action.
- Metric row: clicks, published, ready offers, blocked offers.
- Main performance panel: activity by hour/day.
- Opportunity panel: best categories and top offers.
- Insight panel: recommended next moves.
- Operational health strip: Telegram state, discovery state, affiliate link backlog.

The Home should be visually premium and spacious enough for decision-making, but still dense enough to show real data above the fold.

### Operation

Operation should be the densest workflow screen.

Primary goal:

- Move drafts/offers through review, approval, publication, and correction.

Recommended layout:

- Compact pipeline columns or segmented queue.
- Sticky action bar for discovery, publish, report, and affiliate recalculation.
- Draft/offer cards using compact density.
- Strong visual treatment for blocked official affiliate links.
- Inline affiliate-link entry remains available.
- Status explanations should be concise and close to the action.

Operation can inherit the current column model, but it should look less like generic cards and more like a production queue.

### Offers

Offers should become the inventory and quality-control view.

Primary goal:

- Inspect offer quality, score, validation, source, and readiness.

Recommended layout:

- Summary strip for ready, review, blocked, and discovery candidates.
- Compact data table as the default desktop view.
- Filter/search controls in the top context bar or table toolbar.
- Row-level actions for affiliate link, refresh, and review.
- Mobile fallback cards using the same OfferCard language.

### AI / Reports

AI/Reports should feel more editorial and analytical.

Primary goal:

- Explain what happened and what the operator should do.

Recommended layout:

- Report generation panel.
- Recommendation feed using InsightPanel.
- Historical reports as readable summaries.
- Supporting metrics around category, channel, and timing.

This view can use comfortable density because the operator is reading and deciding, not processing a queue.

### Configuration

Configuration should become a control room, not a loose collection of forms.

Primary goal:

- Make automation, Telegram, discovery, and affiliate readiness settings understandable and safe.

Recommended layout:

- System status summary at top.
- Cards for Automation, Telegram, Affiliate Links, Discovery Amazon, and Health.
- Discovery Amazon remains feature-complete with URLs, terms, interval, score, limit, enabled state, run status, save, and run-now actions.
- Risky/important states such as Telegram dry-run and missing credentials should be obvious.

Config can remain comfortable-to-medium density. Forms need clarity more than compactness.

## Data and State Flow

The redesign should use the current `/api/state` payload as the source of truth.

Initial implementation should not require backend changes. Existing helper functions such as dashboard data builders can be refactored only when needed to support cleaner component boundaries.

The frontend should preserve:

- Existing API routes.
- Existing action behavior.
- Existing loading/toast patterns.
- Existing validation and discovery semantics.

If implementation discovers missing display data, add it explicitly in a later planned backend task rather than smuggling business logic into presentational components.

## Error Handling and Empty States

Every redesigned screen should handle:

- Loading state.
- Empty state.
- Error toast.
- Missing diagnostics.
- No recommendations.
- No discovery sources configured.
- No offers/drafts in a filtered list.

Empty states should be action-oriented:

- "Configure discovery sources" instead of generic "No data".
- "Add official affiliate link" instead of generic "Blocked".
- "Test Telegram" when publish diagnostics are incomplete.

## Responsive Design

Desktop is the primary operating environment, but mobile must not break.

Required behavior:

- CommandRail collapses into a mobile drawer or compact bottom-safe control.
- Tables switch to compact cards on narrow screens.
- Text must not overflow buttons, cards, or badges.
- TopContextBar stacks cleanly.
- Operation cards remain usable on mobile, even if the full pipeline becomes a vertical segmented list.

## Accessibility

The redesign should preserve or improve:

- Button labels and aria labels for icon-only actions.
- Keyboard focus states.
- Color contrast for badges and status text.
- No meaning conveyed by color alone.
- Touch target sizes for mobile controls.

## Implementation Strategy

The redesign should be split into implementation tasks after this spec:

1. Design system foundation.
   - Tokens, shared primitives, AppShell, CommandRail, TopContextBar, badges, buttons, panels, metric tiles, and form fields.
2. Performance Home.
   - Redesign overview into the new performance-first dashboard.
3. Operation.
   - Redesign action panel, pipeline/queue, draft cards, affiliate-link correction, and publish status.
4. Offers.
   - Redesign inventory table/cards, filters, score/readiness display, and row actions.
5. AI / Reports.
   - Redesign recommendations and report history using InsightPanel.
6. Configuration.
   - Redesign automation, Telegram diagnostics, affiliate links, health, and Discovery Amazon control room.
7. Polish and responsive QA.
   - Cross-viewport visual QA, text overflow checks, build/test fixes, and final consistency pass.

Each implementation task should be separately committed so Railway can deploy visible progress incrementally.

## Testing and Verification

Implementation plans should include:

- Existing Node test suite.
- Production build.
- Browser visual checks on desktop and mobile widths.
- Manual interaction checks for key actions:
  - period selection
  - search/filter
  - publishing action
  - affiliate link save
  - discovery settings save
  - discovery run now
  - report generation
  - Telegram test

Screens should be checked for:

- Broken layout.
- Text overflow.
- Missing loading states.
- Inconsistent status colors.
- Inaccessible icon-only buttons.

## Acceptance Criteria

- The design system exists and is documented in code through reusable components/tokens.
- The app shell uses a graphite command-center rail and contextual top bar.
- Home opens as a performance-first dashboard.
- Operation and Offers use compact density for daily workflow.
- AI/Reports and Home use comfortable density for analysis.
- Config reads as a control room for automation and integrations.
- Status badges, action buttons, panels, metrics, and forms are visually consistent.
- Existing app behavior remains intact.
- Tests and production build pass.
- The redesign ships through incremental commits rather than one large risky commit.
