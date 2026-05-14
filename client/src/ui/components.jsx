import React from "react";
import { Loader2, Menu, Search } from "lucide-react";
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
    <div className="min-h-screen bg-tdo-surface text-tdo-ink dark:bg-slate-950 dark:text-slate-100">
      <CommandRail view={view} setView={setView} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      {mobileOpen ? (
        <button
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu"
          type="button"
        />
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
  const railState = mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0";

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 w-[86px] border-r border-white/10 bg-tdo-rail px-3 py-4 text-white transition ${railState}`}>
      <button
        className="mb-6 grid size-12 place-items-center rounded-xl bg-tdo-blue text-sm font-bold shadow-tdo-glow"
        onClick={() => {
          setView("overview");
          setMobileOpen(false);
        }}
        type="button"
        aria-label="Ir para Performance"
      >
        T
      </button>
      <nav className="space-y-2">
        {commandItems.map(({ icon: Icon, label, view: itemView }) => {
          const activeClass = view === itemView
            ? "bg-white text-tdo-rail"
            : "text-slate-300 hover:bg-white/10 hover:text-white";

          return (
            <button
              aria-label={label}
              className={`group relative grid size-12 place-items-center rounded-xl transition ${activeClass}`}
              key={itemView}
              onClick={() => {
                setView(itemView);
                setMobileOpen(false);
              }}
              title={label}
              type="button"
            >
              <Icon className="size-5" />
              <span className="pointer-events-none absolute left-14 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function TopContextBar({
  actions,
  darkMode,
  inputRef,
  query,
  setDarkMode,
  setMobileOpen,
  setQuery,
  view
}) {
  const meta = viewMeta[view] || viewMeta.overview;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-tdo-surface/95 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/95">
      <div className="mx-auto flex min-h-[76px] max-w-[1540px] flex-col gap-3 px-4 py-3 md:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden"
            onClick={() => setMobileOpen(true)}
            type="button"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-slate-950 dark:text-white">{meta.title}</h1>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">{meta.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 sm:w-[280px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              aria-label="Buscar ofertas, canais e status"
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 tdo-focus dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="Buscar ofertas, canais, status..."
            />
          </label>
          <button
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => setDarkMode(!darkMode)}
            type="button"
          >
            {darkMode ? "Claro" : "Escuro"}
          </button>
          {actions}
        </div>
      </div>
    </header>
  );
}

export function Panel({ title, count, children, density = "comfortable", action }) {
  const densityClass = density === "compact" ? "p-4" : "p-5 md:p-6";
  const hasCount = count !== undefined && count !== null;

  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-tdo-card dark:border-slate-800 dark:bg-slate-900 dark:shadow-none ${densityClass}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100 md:text-base">{title}</h2>
          {hasCount ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{count}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function QueueColumn({ title, count, children, tone = "brand" }) {
  const accentClass = {
    brand: "bg-blue-500",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    cyan: "bg-cyan-500",
    muted: "bg-slate-400"
  }[tone] || "bg-blue-500";

  return (
    <Panel
      title={(
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className={`size-2 rounded-full ${accentClass}`} />
          <span className="truncate">{title}</span>
        </span>
      )}
      density="compact"
      action={<StatusBadge tone={tone}>{count}</StatusBadge>}
    >
      <div className="max-h-[760px] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
        {children}
      </div>
    </Panel>
  );
}

export function StatusBadge({ children, tone = "brand" }) {
  const classes = {
    brand: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/20",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20",
    warning: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20",
    danger: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/20",
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-400/20",
    muted: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
  };

  return (
    <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-medium ring-1 ${classes[tone] || classes.brand}`}>
      {children}
    </span>
  );
}

export function ActionButton({
  children,
  disabled,
  loading,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}) {
  const variants = {
    primary: "bg-tdo-blue text-white hover:bg-blue-700",
    secondary: "bg-slate-950 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white",
    outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
  };
  const sizes = {
    sm: "h-9 px-3 text-xs",
    md: "h-10 px-4 text-sm"
  };

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-60 [&>svg]:shrink-0 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || disabled}
      type="button"
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function MetricTile({ icon: Icon, label, value, tone = "brand", detail }) {
  const iconTone = {
    brand: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    danger: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    cyan: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
  }[tone] || "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-tdo-card dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{value}</p>
          {detail ? <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{detail}</p> : null}
        </div>
        {Icon ? (
          <div className={`grid size-11 place-items-center rounded-xl ${iconTone}`}>
            <Icon className="size-5" />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function InsightPanel({ title, detail, action, tone = "brand", toneLabel = "Insight" }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-tdo-card dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <StatusBadge tone={tone}>{toneLabel}</StatusBadge>
      <h3 className="mt-3 text-sm font-semibold text-slate-950 dark:text-slate-100">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{detail}</p>
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

export function DataTable({ columns, rows, getKey, renderMobileCard }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 lg:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 ${column.className || ""}`}
                  scope="col"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/30">
            {rows.map((row) => (
              <tr key={getKey(row)} className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 align-top text-slate-700 dark:text-slate-300 ${column.cellClassName || ""}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <React.Fragment key={getKey(row)}>
            {renderMobileCard(row)}
          </React.Fragment>
        ))}
      </div>
    </>
  );
}

export function toneForStatus(status) {
  return statusTone(status);
}
