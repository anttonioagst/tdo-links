# TDO Design System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TDO-specific design system first, then use it to redesign the full app into a premium affiliate performance cockpit.

**Architecture:** Keep the existing React/Vite/Tailwind app and Node backend contracts. Split reusable UI primitives into focused frontend modules, then migrate each view onto those primitives in small commits. The first implementation task creates the design-system anchor; later tasks only compose and extend it.

**Tech Stack:** React 19, Vite 5, Tailwind CSS 4, lucide-react, existing Node HTTP backend, JSON persistence, `node test/run-tests.js`, `npm run build`.

---

## Scope

This plan implements the approved spec:

- Spec: `docs/superpowers/specs/2026-05-13-tdo-design-system-redesign-design.md`
- Existing main UI: `client/src/App.jsx`
- Existing global styles/tokens: `client/src/styles.css`
- Existing tests: `test/run-tests.js`

The implementation must not add new backend product features. It may add small pure frontend model helpers if they make UI behavior testable.

## File Structure

Create or modify these files:

- Create `client/src/ui/tokens.js`
  - Exports navigation metadata, status tone maps, view copy, density constants, and small pure helpers.
- Create `client/src/ui/components.jsx`
  - Reusable design-system primitives: `AppShell`, `CommandRail`, `TopContextBar`, `Panel`, `MetricTile`, `InsightPanel`, `StatusBadge`, `ActionButton`, `IconButton`, `EmptyState`, `FormField`, `DataTable`.
- Create `client/src/ui/format.js`
  - Pure display helpers currently embedded in `App.jsx`: money/date/status/channel formatting.
- Modify `client/src/styles.css`
  - Add TDO token variables, utility classes, focus rings, scrollbars, responsive table/card helpers.
- Modify `client/src/App.jsx`
  - Migrate from generic sidebar/header/cards to the new design-system shell and redesigned screens.
- Modify `test/run-tests.js`
  - Add pure UI contract tests for `tokens.js` and `format.js`. Do not import JSX.
- Optional create `docs/superpowers/specs/2026-05-13-tdo-design-system-redesign-design.md`
  - Already exists; do not modify unless implementation reveals a contradiction.

## Implementation Rules

- Keep behavior intact: existing API routes, actions, loading states, toasts, and backend semantics must continue working.
- Commit after each task.
- Run `node test/run-tests.js` after tasks that touch pure helpers or behavior.
- Run `npm run build` after each UI task.
- Visually verify with a local server after each screen-level task.
- Keep `.superpowers/` ignored and do not commit visual-companion artifacts.
- Do not use a new UI framework.

## Task 1: Design-System Foundation

**Files:**

- Create: `client/src/ui/tokens.js`
- Create: `client/src/ui/format.js`
- Create: `client/src/ui/components.jsx`
- Modify: `client/src/styles.css`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Add pure UI token tests**

Append these tests near the end of `test/run-tests.js`, before the runner executes the test list:

```js
import {
  commandItems,
  densityForView,
  statusTone,
  viewMeta
} from "../client/src/ui/tokens.js";
import {
  channelLabel as uiChannelLabel,
  money as uiMoney,
  statusLabel as uiStatusLabel
} from "../client/src/ui/format.js";

test("ui tokens define the command-center navigation", () => {
  assert.deepEqual(commandItems.map((item) => item.view), ["overview", "operation", "offers", "ai", "config"]);
  assert.equal(viewMeta.overview.title, "Performance");
  assert.equal(viewMeta.operation.title, "Operacao");
  assert.equal(densityForView("operation"), "compact");
  assert.equal(densityForView("overview"), "comfortable");
});

test("ui status tones and labels stay consistent", () => {
  assert.equal(statusTone("auto_ready"), "success");
  assert.equal(statusTone("blocked"), "danger");
  assert.equal(statusTone("needs_review"), "warning");
  assert.equal(uiStatusLabel("published"), "Publicado");
  assert.equal(uiChannelLabel("telegram"), "Telegram");
  assert.equal(uiMoney(349.9), "R$ 349,90");
});
```

- [ ] **Step 2: Run tests to verify the imports fail**

Run:

```bash
node test/run-tests.js
```

Expected:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/antonio/Projects/Investment/tdo-links/client/src/ui/tokens.js'
```

- [ ] **Step 3: Create `client/src/ui/tokens.js`**

Create:

```js
import {
  BarChart3,
  Bot,
  Gauge,
  Send,
  Settings,
  ShoppingBag
} from "lucide-react";

export const commandItems = [
  { view: "overview", label: "Performance", icon: BarChart3 },
  { view: "operation", label: "Operacao", icon: Send },
  { view: "offers", label: "Ofertas", icon: ShoppingBag },
  { view: "ai", label: "IA", icon: Bot },
  { view: "config", label: "Config", icon: Settings }
];

export const viewMeta = {
  overview: {
    title: "Performance",
    subtitle: "Clique, horario, categoria e oportunidade para decidir o proximo movimento.",
    density: "comfortable",
    primaryAction: "Buscar oportunidades"
  },
  operation: {
    title: "Operacao",
    subtitle: "Fila de revisao, links oficiais e publicacao segura.",
    density: "compact",
    primaryAction: "Publicar elegiveis"
  },
  offers: {
    title: "Ofertas",
    subtitle: "Inventario, score, origem e prontidao de afiliado.",
    density: "compact",
    primaryAction: "Recalcular afiliados"
  },
  ai: {
    title: "IA / Relatorios",
    subtitle: "Analises operacionais e proximas acoes recomendadas.",
    density: "comfortable",
    primaryAction: "Gerar analise"
  },
  config: {
    title: "Configuracao",
    subtitle: "Automacao, Telegram, descoberta e seguranca operacional.",
    density: "comfortable",
    primaryAction: "Testar Telegram"
  }
};

export const statusToneMap = {
  auto_ready: "success",
  approved: "success",
  published: "success",
  needs_review: "warning",
  blocked: "danger",
  failed: "danger",
  rejected: "danger",
  archived: "muted",
  discovery: "cyan",
  dry_run: "warning",
  ready: "success",
  problem: "danger"
};

export function statusTone(status) {
  return statusToneMap[status] || "brand";
}

export function densityForView(view) {
  return viewMeta[view]?.density || "comfortable";
}
```

- [ ] **Step 4: Create `client/src/ui/format.js`**

Create:

```js
export function money(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function statusLabel(status) {
  return {
    auto_ready: "Pronto",
    needs_review: "Revisao",
    approved: "Aprovado",
    published: "Publicado",
    archived: "Arquivado",
    rejected: "Rejeitado",
    failed: "Falhou",
    blocked: "Bloqueado"
  }[status] || status;
}

export function channelLabel(channel) {
  return { telegram: "Telegram", x: "X / Twitter" }[channel] || channel;
}
```

- [ ] **Step 5: Create `client/src/ui/components.jsx` with primitives**

Create the file with these exports. Keep implementations focused and presentational:

```jsx
import React from "react";
import { Loader2, Menu, Search, X } from "lucide-react";
import { commandItems, statusTone, viewMeta } from "./tokens.js";

export function AppShell({
  children,
  darkMode,
  inputRef,
  query,
  setDarkMode,
  setMobileOpen,
  setQuery,
  mobileOpen,
  view,
  setView,
  topBar
}) {
  return (
    <div className="min-h-screen bg-tdo-surface text-tdo-ink">
      <CommandRail view={view} setView={setView} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      {mobileOpen ? (
        <button className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" />
      ) : null}
      <div className="min-h-screen transition lg:pl-[92px]">
        <TopContextBar
          darkMode={darkMode}
          inputRef={inputRef}
          query={query}
          setDarkMode={setDarkMode}
          setMobileOpen={setMobileOpen}
          setQuery={setQuery}
          view={view}
          {...topBar}
        />
        <main className="mx-auto max-w-[1540px] px-4 py-5 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function CommandRail({ mobileOpen, setMobileOpen, setView, view }) {
  return (
    <aside className={`fixed inset-y-0 left-0 z-50 w-[86px] border-r border-white/10 bg-tdo-rail px-3 py-4 text-white transition ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
      <button className="mb-6 grid size-12 place-items-center rounded-xl bg-tdo-blue text-sm font-bold shadow-tdo-glow" onClick={() => setView("overview")} type="button">
        T
      </button>
      <nav className="space-y-2">
        {commandItems.map(({ icon: Icon, label, view: itemView }) => (
          <button
            aria-label={label}
            className={`group relative grid size-12 place-items-center rounded-xl transition ${view === itemView ? "bg-white text-tdo-rail" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
            key={itemView}
            onClick={() => {
              setView(itemView);
              setMobileOpen(false);
            }}
            title={label}
            type="button"
          >
            <Icon className="size-5" />
            <span className="pointer-events-none absolute left-14 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-2 py-1 text-xs text-white shadow-lg group-hover:block">{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

export function TopContextBar({ actions, darkMode, inputRef, query, setDarkMode, setMobileOpen, setQuery, view }) {
  const meta = viewMeta[view] || viewMeta.overview;
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-tdo-surface/95 backdrop-blur">
      <div className="mx-auto flex min-h-[76px] max-w-[1540px] flex-col gap-3 px-4 py-3 md:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 lg:hidden" onClick={() => setMobileOpen(true)} type="button" aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-slate-950">{meta.title}</h1>
            <p className="truncate text-sm text-slate-500">{meta.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 sm:w-[280px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none ring-tdo-blue/20 focus:border-tdo-blue focus:ring-4" placeholder="Buscar ofertas, canais, status..." />
          </label>
          <button className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700" onClick={() => setDarkMode(!darkMode)} type="button">
            {darkMode ? "Claro" : "Escuro"}
          </button>
          {actions}
        </div>
      </div>
    </header>
  );
}

export function Panel({ title, count, children, density = "comfortable", action }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-tdo-card ${density === "compact" ? "p-4" : "p-5 md:p-6"}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 md:text-base">{title}</h2>
          {count ? <p className="mt-1 text-xs text-slate-500">{count}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatusBadge({ children, tone = "brand" }) {
  const classes = {
    brand: "bg-blue-50 text-blue-700 ring-blue-200",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warning: "bg-amber-50 text-amber-800 ring-amber-200",
    danger: "bg-rose-50 text-rose-700 ring-rose-200",
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    muted: "bg-slate-100 text-slate-600 ring-slate-200"
  };
  return <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-medium ring-1 ${classes[tone] || classes.brand}`}>{children}</span>;
}

export function ActionButton({ children, loading, variant = "primary", size = "md", className = "", ...props }) {
  const variants = {
    primary: "bg-tdo-blue text-white hover:bg-blue-700",
    secondary: "bg-slate-950 text-white hover:bg-slate-800",
    outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    ghost: "text-slate-600 hover:bg-slate-100"
  };
  const sizes = { sm: "h-9 px-3 text-xs", md: "h-10 px-4 text-sm" };
  return (
    <button className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${className}`} disabled={loading || props.disabled} type="button" {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function MetricTile({ icon: Icon, label, value, tone = "brand", detail }) {
  const iconTone = {
    brand: "bg-blue-50 text-blue-700",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-rose-50 text-rose-700",
    cyan: "bg-cyan-50 text-cyan-700"
  }[tone] || "bg-blue-50 text-blue-700";
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-tdo-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          {detail ? <p className="mt-1 truncate text-xs text-slate-500">{detail}</p> : null}
        </div>
        {Icon ? <div className={`grid size-11 place-items-center rounded-xl ${iconTone}`}><Icon className="size-5" /></div> : null}
      </div>
    </article>
  );
}

export function InsightPanel({ title, detail, action, tone = "brand" }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-tdo-card">
      <StatusBadge tone={tone}>{tone}</StatusBadge>
      <h3 className="mt-3 text-sm font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">{detail}</p>
      {action}
    </article>
  );
}

export function EmptyState({ title, text, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function toneForStatus(status) {
  return statusTone(status);
}
```

- [ ] **Step 6: Add TDO CSS tokens**

Append the TDO token layer to `client/src/styles.css` after the existing `@theme` block:

```css
@theme {
  --color-tdo-rail: #171717;
  --color-tdo-ink: #111827;
  --color-tdo-surface: #f6f7f9;
  --color-tdo-panel: #ffffff;
  --color-tdo-blue: #2563eb;
  --color-tdo-cyan: #06b6d4;
  --color-tdo-green: #10b981;
  --color-tdo-amber: #f59e0b;
  --color-tdo-red: #e11d48;
  --shadow-tdo-card: 0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 28px rgba(15, 23, 42, 0.04);
  --shadow-tdo-glow: 0 14px 30px rgba(37, 99, 235, 0.35);
}

@utility tdo-focus {
  @apply outline-none ring-tdo-blue/20 focus:border-tdo-blue focus:ring-4;
}
```

- [ ] **Step 7: Run tests and build**

Run:

```bash
node test/run-tests.js
npm run build
```

Expected:

```text
50+ tests passed
✓ built in 1.2s
```

- [ ] **Step 8: Commit**

Run:

```bash
git add client/src/ui/tokens.js client/src/ui/format.js client/src/ui/components.jsx client/src/styles.css test/run-tests.js
git commit -m "feat: add tdo design system foundation"
```

## Task 2: App Shell and Command Center Navigation

**Files:**

- Modify: `client/src/App.jsx`
- Modify: `client/src/ui/components.jsx`
- Test: `test/run-tests.js`

- [ ] **Step 1: Add a shell contract test**

Add to `test/run-tests.js`:

```js
test("view metadata provides contextual primary actions", () => {
  assert.equal(viewMeta.overview.primaryAction, "Buscar oportunidades");
  assert.equal(viewMeta.operation.primaryAction, "Publicar elegiveis");
  assert.equal(viewMeta.config.primaryAction, "Testar Telegram");
});
```

- [ ] **Step 2: Run tests**

Run:

```bash
node test/run-tests.js
```

Expected:

```text
all tests passed
```

- [ ] **Step 3: Replace old Sidebar/Header/PageTitle usage**

In `client/src/App.jsx`:

- Import `AppShell` and `ActionButton` from `./ui/components.jsx`.
- Import `viewMeta` from `./ui/tokens.js`.
- Remove old `Sidebar`, `Header`, and `PageTitle` rendering from the return tree.
- Keep old component functions temporarily if later tasks still reference helpers; remove unused ones only after build confirms.

Replace the root layout in `App` with:

```jsx
const topBarActions = (
  <ActionButton onClick={() => refresh().catch((error) => toast("Erro ao atualizar", error.message, "error"))}>
    <RefreshCcw className="size-4" />
    Atualizar
  </ActionButton>
);

return (
  <AppShell
    darkMode={darkMode}
    inputRef={inputRef}
    mobileOpen={isMobileOpen}
    query={query}
    setDarkMode={setDarkMode}
    setMobileOpen={setIsMobileOpen}
    setQuery={setQuery}
    setView={setView}
    topBar={{ actions: topBarActions }}
    view={view}
  >
    {view === "overview" && <Overview state={state} data={data} setPeriod={setPeriod} period={period} setView={setView} />}
    {view === "operation" && <Operation state={state} data={data} drafts={drafts} loading={loading} api={api} action={action} />}
    {view === "offers" && <Offers state={state} data={data} offers={offers} loading={loading} api={api} action={action} />}
    {view === "ai" && <Reports state={state} data={data} loading={loading} api={api} action={action} />}
    {view === "config" && <Config state={state} data={data} loading={loading} api={api} action={action} />}
  </AppShell>
);
```

- [ ] **Step 4: Build**

Run:

```bash
npm run build
```

Expected:

```text
✓ built in 1.2s
```

- [ ] **Step 5: Visual check**

Run local server:

```bash
PORT=4318 npm start
```

Open `http://127.0.0.1:4318` and verify:

- Graphite command rail appears.
- Mobile menu button appears on narrow viewport.
- Search still filters offers/drafts.
- Refresh button updates state.
- All five views are reachable.

- [ ] **Step 6: Commit**

```bash
git add client/src/App.jsx client/src/ui/components.jsx test/run-tests.js
git commit -m "feat: add command center app shell"
```

## Task 3: Performance-First Home

**Files:**

- Modify: `client/src/App.jsx`
- Modify: `client/src/ui/components.jsx`
- Test: `test/run-tests.js`

- [ ] **Step 1: Add data contract tests for dashboard readiness**

Add to `test/run-tests.js`:

```js
test("performance home metadata uses comfortable density", () => {
  assert.equal(densityForView("overview"), "comfortable");
  assert.match(viewMeta.overview.subtitle, /Clique/);
});
```

- [ ] **Step 2: Run tests**

Run:

```bash
node test/run-tests.js
```

Expected: pass.

- [ ] **Step 3: Redesign `Overview`**

Replace `Overview`, `Metrics`, `Metric`, `SalesChart`, `TargetCard`, `StatisticsCard`, `ChannelsCard`, and `RecentOffers` composition with:

```jsx
function Overview({ state, data, setPeriod, period, setView }) {
  const primaryInsight = data.alerts[0] || {
    title: data.rec.title,
    text: data.rec.text,
    tone: data.healthTone === "critical" ? "danger" : data.healthTone === "warning" ? "warning" : "success"
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile icon={MousePointerClick} label="Cliques" value={state.metrics.clicks} detail={`${data.clickRate}% CTR estimado`} tone="success" />
        <MetricTile icon={Send} label="Publicados" value={state.metrics.published} detail="Telegram / X" tone="brand" />
        <MetricTile icon={CheckCircle2} label="Prontos" value={data.autoReady} detail="Elegiveis para publicar" tone="success" />
        <MetricTile icon={AlertTriangle} label="Bloqueados" value={data.missingAffiliate} detail="Link oficial pendente" tone="warning" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <Panel title="Performance por horario" count="Atividade no periodo selecionado">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Use os horarios mais fortes para decidir quando publicar oportunidades.</p>
            <select value={period} onChange={(event) => setPeriod(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 tdo-focus">
              {periods.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <Heatmap heatmap={data.heatmap} />
        </Panel>
        <InsightPanel
          title={primaryInsight.title}
          detail={primaryInsight.text}
          tone={primaryInsight.tone === "critical" ? "danger" : primaryInsight.tone || "brand"}
          action={<ActionButton className="mt-4" onClick={() => setView(data.rec.action.view)}>{data.rec.action.label}</ActionButton>}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <Panel title="Funil de oportunidades" count="Status, canais e categorias">
          <div className="grid gap-4 lg:grid-cols-3">
            <Bars title="Status" items={data.statusBars} />
            <Bars title="Canais" items={data.channelBars} />
            <Bars title="Categorias" items={data.categoryBars} />
          </div>
        </Panel>
        <Panel title="Melhores oportunidades" count="Ordenadas por score">
          <OfferTable offers={data.topOffers} clicksByOffer={state.metrics.clicksByOffer} />
        </Panel>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build and visual check**

Run:

```bash
npm run build
PORT=4318 npm start
```

Verify:

- Home title says Performance.
- Metric row appears above fold.
- Heatmap fits desktop and mobile.
- Opportunity table/card does not overflow.
- Period selector still changes data.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx test/run-tests.js
git commit -m "feat: redesign performance home"
```

## Task 4: Operation Queue Redesign

**Files:**

- Modify: `client/src/App.jsx`
- Modify: `client/src/ui/components.jsx`

- [ ] **Step 1: Add `OfferCard` and compact queue helpers**

Add to `client/src/ui/components.jsx`:

```jsx
export function QueueColumn({ title, count, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-tdo-card">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <StatusBadge tone="muted">{count}</StatusBadge>
      </div>
      <div className="max-h-[760px] space-y-3 overflow-y-auto p-3 custom-scrollbar">{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: Replace `ActionPanel` with compact command strip**

Use `ActionButton` and keep the same API calls:

```jsx
function ActionPanel({ data, loading, api, action }) {
  return (
    <Panel title="Acoes operacionais" count={`${data.pending} pendentes`} density="compact">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ActionButton loading={loading.scrape} onClick={() => action("scrape", () => api("/api/run/scrape", { method: "POST" }), "Ofertas coletadas")}><Search className="size-4" /> Buscar ofertas</ActionButton>
        <ActionButton loading={loading.publish} onClick={() => action("publish", () => api("/api/run/publish", { method: "POST" }), "Publicacao executada")}><Send className="size-4" /> Publicar elegiveis</ActionButton>
        <ActionButton variant="outline" loading={loading.report} onClick={() => action("report", () => api("/api/run/report", { method: "POST" }), "Relatorio gerado")}><BarChart3 className="size-4" /> Gerar relatorio</ActionButton>
        <ActionButton variant="outline" loading={loading.refreshAffiliates} onClick={() => action("refreshAffiliates", () => api("/api/run/refresh-affiliates", { method: "POST" }), "Links recalculados")}><RefreshCcw className="size-4" /> Recalcular links</ActionButton>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 3: Update `Operation` to use compact queue columns**

Import `QueueColumn`. Replace column `Panel` usage with `QueueColumn`:

```jsx
<div className="grid gap-4 xl:grid-cols-3">
  {draftColumns.map(([column, title]) => {
    const columnDrafts = drafts.filter((draft) => draftColumn(draft) === column);
    return (
      <QueueColumn key={column} title={title} count={columnDrafts.length}>
        {columnDrafts.map((draft) => {
          const offer = state.offers.find((item) => item.id === draft.offerId);
          return <DraftCard key={draft.id} draft={draft} offer={offer} loading={loading} api={api} action={action} />;
        })}
        {!columnDrafts.length ? <EmptyState title="Fila vazia" text="Nenhum draft neste status." /> : null}
      </QueueColumn>
    );
  })}
</div>
```

- [ ] **Step 4: Restyle `DraftCard`**

Keep all behavior, but use:

- `StatusBadge` instead of old `Badge`.
- `ActionButton` instead of old `Button`.
- compact padding `p-3`.
- stronger official-link-pending block.

For the affiliate link box, use this structure:

```jsx
<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
    <span className="text-xs font-semibold text-amber-900">Link afiliado oficial</span>
    <StatusBadge tone={offer.affiliateReady ? "success" : "warning"}>{offer.affiliateReady ? "Pronto" : "Pendente"}</StatusBadge>
  </div>
  <div className="flex flex-col gap-2 sm:flex-row">
    <input
      value={affiliateUrl}
      onChange={(event) => setAffiliateUrl(event.target.value)}
      placeholder="Cole o link do SiteStripe ou amzn.to"
      className="h-10 min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 text-sm text-slate-700 tdo-focus"
    />
    <ActionButton
      size="sm"
      variant="outline"
      loading={loading[`affiliate-${offer.id}`]}
      disabled={!affiliateUrl.trim()}
      onClick={() => action(`affiliate-${offer.id}`, () => api(`/api/offers/${offer.id}/affiliate`, { method: "POST", body: { affiliateUrl } }), "Link afiliado salvo")}
    >
      Salvar link
    </ActionButton>
  </div>
</div>
```

- [ ] **Step 5: Build and visual check**

Run:

```bash
npm run build
PORT=4318 npm start
```

Verify:

- Queue columns fit on desktop.
- Cards are compact.
- Affiliate pending state is obvious.
- Approve/edit/regenerate/clone/reject actions still work.

- [ ] **Step 6: Commit**

```bash
git add client/src/App.jsx client/src/ui/components.jsx
git commit -m "feat: redesign operation queue"
```

## Task 5: Offers Inventory Redesign

**Files:**

- Modify: `client/src/App.jsx`
- Modify: `client/src/ui/components.jsx`

- [ ] **Step 1: Add `DataTable` primitive**

Add to `client/src/ui/components.jsx`:

```jsx
export function DataTable({ columns, rows, getKey, renderMobileCard }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 lg:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>{columns.map((column) => <th key={column.key} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{column.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => <tr key={getKey(row)}>{columns.map((column) => <td key={column.key} className="px-4 py-3 align-top text-slate-700">{column.render(row)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 lg:hidden">{rows.map((row) => <React.Fragment key={getKey(row)}>{renderMobileCard(row)}</React.Fragment>)}</div>
    </>
  );
}
```

- [ ] **Step 2: Redesign `Offers` summary**

Use metric/status strip:

```jsx
function Offers({ state, data, offers, loading, api, action }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile label="Prontas" value={data.autoReady} tone="success" />
        <MetricTile label="Afiliado pendente" value={data.missingAffiliate} tone="warning" />
        <MetricTile label="Total" value={offers.length} tone="brand" />
        <MetricTile label="Publicadas" value={state.metrics.published} tone="success" />
      </div>
      <Panel title="Inventario de ofertas" count={`${offers.length} ofertas`} density="compact">
        <OfferTable offers={offers} clicksByOffer={state.metrics.clicksByOffer} loading={loading} api={api} action={action} />
      </Panel>
    </div>
  );
}
```

- [ ] **Step 3: Migrate `OfferTable` to `DataTable`**

Keep existing columns and inline affiliate actions, but render through `DataTable`. Columns must include:

- Oferta.
- Score.
- Status.
- Afiliado.
- Cliques.
- Acoes.

- [ ] **Step 4: Build and visual check**

Run:

```bash
npm run build
PORT=4318 npm start
```

Verify:

- Desktop uses table.
- Mobile uses cards.
- Discovery labels still appear.
- Affiliate save still calls `/api/offers/:id/affiliate`.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/ui/components.jsx
git commit -m "feat: redesign offers inventory"
```

## Task 6: AI Reports Redesign

**Files:**

- Modify: `client/src/App.jsx`

- [ ] **Step 1: Redesign `Reports` with InsightPanel**

Replace the layout with:

```jsx
function Reports({ state, data, loading, api, action }) {
  const recommendations = state.recommendations || data.recommendations || [];
  return (
    <div className="grid grid-cols-12 gap-5">
      <div className="col-span-12 xl:col-span-4">
        <Panel title="Analise operacional" count={`${data.healthScore}/100`}>
          <p className="text-sm leading-6 text-slate-500">Gere uma leitura de gargalos, categorias, canais e proximas acoes.</p>
          <ActionButton className="mt-4" loading={loading.report} onClick={() => action("report", () => api("/api/run/report", { method: "POST" }), "Relatorio gerado")}><BarChart3 className="size-4" /> Gerar analise</ActionButton>
        </Panel>
      </div>
      <div className="col-span-12 xl:col-span-8">
        <Panel title="Recomendacoes" count={`${recommendations.length}`}>
          <div className="grid gap-3 md:grid-cols-2">
            {recommendations.map((rec) => (
              <InsightPanel key={rec.id} title={rec.title} detail={rec.detail} tone={rec.severity === "critical" ? "danger" : rec.severity === "success" ? "success" : "brand"} />
            ))}
          </div>
          {!recommendations.length ? <EmptyState title="Sem recomendacoes" text="Gere uma analise para receber proximas acoes." /> : null}
        </Panel>
      </div>
      <div className="col-span-12">
        <Panel title="Historico de relatorios" count={`${state.reports.length}`}>
          <div className="space-y-3">
            {state.reports.map((report) => (
              <article key={report.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">{report.period}</p>
                <h3 className="mt-2 text-sm font-semibold text-slate-950">{report.expectedImpact}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{report.conclusions.join(" ")}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{report.suggestions.join(" ")}</p>
              </article>
            ))}
            {!state.reports.length ? <EmptyState title="Nenhum relatorio" text="Gere uma analise para popular este painel." /> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build and visual check**

Run:

```bash
npm run build
PORT=4318 npm start
```

Verify:

- Generate report button still works.
- Recommendations use consistent insight cards.
- Long report text wraps without overflow.

- [ ] **Step 3: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat: redesign ai reports"
```

## Task 7: Configuration Control Room

**Files:**

- Modify: `client/src/App.jsx`
- Modify: `client/src/ui/components.jsx`

- [ ] **Step 1: Add `FormField` primitive**

Add to `client/src/ui/components.jsx`:

```jsx
export function FormField({ label, help, error, children }) {
  return (
    <label className="block text-sm text-slate-700">
      <span className="font-medium text-slate-800">{label}</span>
      {help ? <span className="mt-1 block text-xs text-slate-500">{help}</span> : null}
      <div className="mt-2">{children}</div>
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : null}
    </label>
  );
}
```

- [ ] **Step 2: Redesign `Config` card structure**

Keep all current state and action logic. Replace visual structure with:

```jsx
return (
  <div className="space-y-5">
    <div className="grid gap-4 md:grid-cols-3">
      <MetricTile label="Telegram" value={telegramCount} tone={telegram?.ready ? "success" : "warning"} />
      <MetricTile label="Discovery" value={discovery.enabled ? "Ativa" : "Pausada"} tone={discovery.enabled ? "success" : "warning"} />
      <MetricTile label="Saude" value={`${data.healthScore}/100`} tone={data.healthTone === "critical" ? "danger" : "brand"} />
    </div>
    <div className="grid grid-cols-12 gap-5">
      <div className="col-span-12 space-y-5 xl:col-span-4">
        <Panel title="Automacao" count={modeLabel(state.settings.mode)}>
          <select value={state.settings.mode} onChange={(event) => action("mode", () => api("/api/settings", { method: "POST", body: { mode: event.target.value } }), "Modo atualizado")} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 tdo-focus">
            <option value="limited">Automatico limitado</option>
            <option value="manual">Manual</option>
            <option value="paused">Pausado</option>
          </select>
        </Panel>
        <Panel title="Telegram" count={telegramCount}>
          <div className="space-y-2 text-sm text-slate-600">
            <p>Dry-run: {telegramValue(telegram?.dryRun, "Ligado", "Desligado")}</p>
            <p>Bot token: {telegramValue(telegram?.hasBotToken, "Configurado", "Ausente")}</p>
            <p>Chat ID: {telegramValue(telegram?.hasChatId, "Configurado", "Ausente")}</p>
          </div>
          <ActionButton className="mt-4" variant="outline" loading={loading.telegramTest} onClick={() => action("telegramTest", () => api("/api/integrations/telegram/test", { method: "POST" }), "Teste Telegram executado")}>Testar Telegram</ActionButton>
        </Panel>
        <Panel title="Links afiliados" count={`${data.missingAffiliate} pendentes`}>
          <p className="text-sm leading-6 text-slate-500">Recalcula URLs afiliadas usando as variaveis atuais do ambiente.</p>
          <ActionButton className="mt-4" loading={loading.refreshAffiliates} onClick={() => action("refreshAffiliates", () => api("/api/run/refresh-affiliates", { method: "POST" }), "Links recalculados")}>Recalcular</ActionButton>
        </Panel>
      </div>
      <div className="col-span-12 space-y-5 xl:col-span-8">
        <Panel title="Descoberta Amazon" count={discovery.enabled ? "Ativa" : "Pausada"}>
          <p className="text-sm text-slate-500">Use os campos existentes de URLs, termos, intervalo, score minimo, limite por ciclo, status da ultima rodada, salvar e buscar agora.</p>
        </Panel>
        <Panel title="Saude" count={`${data.healthScore}/100`}>
          <div className="space-y-3">{data.alerts.map((alert) => <AlertItem key={alert.title} alert={alert} />)}</div>
        </Panel>
      </div>
    </div>
  </div>
);
```

Organize sections:

- Automation.
- Telegram.
- Affiliate Links.
- Health.
- Discovery Amazon as the wide primary config panel.

- [ ] **Step 3: Convert Discovery Amazon fields to FormField**

Use `FormField` for:

- URLs Amazon.
- Termos de busca.
- Intervalo.
- Score minimo.
- Maximo por ciclo.
- Automatic discovery toggle.

Keep `saveDiscovery` and `runDiscovery` unchanged.

- [ ] **Step 4: Build and interaction check**

Run:

```bash
npm run build
PORT=4318 npm start
```

Verify:

- Mode select still saves.
- Telegram test still works.
- Recalculate affiliates still works.
- Discovery settings save.
- Discovery run now works.
- Last run and next run remain visible.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/ui/components.jsx
git commit -m "feat: redesign configuration control room"
```

## Task 8: Responsive Polish and Cleanup

**Files:**

- Modify: `client/src/App.jsx`
- Modify: `client/src/styles.css`
- Modify: `client/src/ui/components.jsx`
- Modify: `client/src/ui/tokens.js`
- Modify: `client/src/ui/format.js`

- [ ] **Step 1: Remove unused old UI components**

In `client/src/App.jsx`, remove component definitions no longer referenced:

- Old `Sidebar`.
- Old `Header`.
- Old `PageTitle`.
- Old `Metric`.
- Old `Button` if fully replaced.
- Old `Badge` if fully replaced.

Run:

```bash
rg -n "function (Sidebar|Header|PageTitle|Metric\\(|Button\\(|Badge\\()" client/src/App.jsx
```

Expected: no matches for removed components.

- [ ] **Step 2: Search for generic template copy**

Run:

```bash
rg -n "eCommerce|Affiliate Admin|Filter|See all|Monthly|Customers|Orders" client/src/App.jsx client/src/styles.css
```

Expected: no generic template copy remains, except intentional domain terms.

- [ ] **Step 3: Mobile visual check**

Run:

```bash
PORT=4318 npm start
```

Check these widths in browser dev tools or Playwright:

- 390px wide.
- 768px wide.
- 1440px wide.

Verify:

- No text overlaps.
- Command navigation is usable.
- Tables become cards or scroll safely.
- Buttons do not overflow.
- Operation remains usable.

- [ ] **Step 4: Final verification**

Run:

```bash
node test/run-tests.js
npm run build
git status --short --branch
```

Expected:

```text
50+ tests passed
✓ built in 1.2s
## main...origin/main [ahead N]
```

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/styles.css client/src/ui/components.jsx client/src/ui/tokens.js client/src/ui/format.js test/run-tests.js
git commit -m "chore: polish tdo redesign"
```

## Final Delivery

After Task 8:

- Run the full test suite and production build one final time.
- Push commits to `origin main` if GitHub auth is available.
- If Railway auto-deploys from GitHub, confirm deployment state or logs when credentials are available.
- Summarize each commit and any residual risks.
