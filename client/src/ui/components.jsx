import React from "react";
import { Loader2, Menu } from "lucide-react";
import { commandItems, statusTone, viewMeta } from "./tokens.js";
import { cn } from "../lib/utils.js";
import { Button } from "../components/ui/button.jsx";
import { Card, CardContent } from "../components/ui/card.jsx";
import { Badge } from "../components/ui/badge.jsx";

export function AppShell({
  children,
  inputRef,
  setMobileOpen,
  mobileOpen,
  view,
  setView,
  topBar
}) {
  return (
    <div className="min-h-screen bg-[#050505] text-slate-100">
      <CommandRail view={view} setView={setView} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      {mobileOpen ? (
        <button
          className="fixed inset-0 z-40 bg-black/80 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu"
          type="button"
        />
      ) : null}
      <div className="min-h-screen transition lg:pl-[92px]">
        <TopContextBar
          inputRef={inputRef}
          setMobileOpen={setMobileOpen}
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
    <aside className={`fixed inset-y-0 left-0 z-50 w-[86px] border-r border-slate-800 bg-[#050505] px-3 py-4 text-white transition ${railState}`}>
      <button
        className="mb-6 grid size-12 place-items-center rounded-lg border border-zinc-500/30 bg-zinc-200 text-sm font-bold text-zinc-950 shadow-lg shadow-black/30 transition hover:bg-white"
        onClick={() => {
          setView("overview");
          setMobileOpen(false);
        }}
        type="button"
        aria-label="Ir para Performance"
      >
        <span className="text-base font-bold text-zinc-950">T</span>
      </button>
      <nav className="space-y-2">
        {commandItems.map(({ icon: Icon, label, view: itemView }) => {
          const isActive = view === itemView;
          return (
            <button
              aria-label={label}
              className={cn(
                "group relative grid size-12 place-items-center rounded-lg transition",
                isActive
                  ? "bg-white/10 text-white ring-1 ring-zinc-500/40"
                  : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"
              )}
              key={itemView}
              onClick={() => {
                setView(itemView);
                setMobileOpen(false);
              }}
              title={label}
              type="button"
            >
              <Icon className="size-5" />
              <span className="pointer-events-none absolute left-14 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-700 bg-[#0a0a0a] px-2 py-1 text-xs text-slate-200 shadow-lg group-hover:block">
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function TopContextBar({ actions, inputRef, setMobileOpen, view }) {
  const meta = viewMeta[view] || viewMeta.overview;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#050505]/95 backdrop-blur">
      <div className="mx-auto flex min-h-[72px] max-w-[1540px] flex-col gap-3 px-4 py-3 md:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="grid size-10 place-items-center rounded-lg border border-slate-700 bg-[#0a0a0a] text-slate-300 transition hover:bg-slate-800 lg:hidden"
            onClick={() => setMobileOpen(true)}
            type="button"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-100">{meta.title}</h1>
            <p className="truncate text-xs text-slate-500">{meta.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
    <section className={cn(
      "rounded-lg border border-slate-800 bg-[#0a0a0a] shadow-sm shadow-black/30",
      densityClass
    )}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 md:text-base">{title}</h2>
          {hasCount ? <p className="mt-1 text-xs text-slate-500">{count}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function QueueColumn({ title, count, children, tone = "brand" }) {
  const accentClass = {
    brand: "bg-zinc-400",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    cyan: "bg-zinc-400",
    muted: "bg-slate-500"
  }[tone] || "bg-zinc-400";

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
  const variantMap = {
    brand: "default",
    success: "success",
    warning: "warning",
    danger: "danger",
    cyan: "cyan",
    muted: "muted",
  };
  return (
    <Badge variant={variantMap[tone] || "default"}>
      {children}
    </Badge>
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
  const variantMap = {
    primary: "default",
    secondary: "secondary",
    outline: "outline",
    danger: "destructive",
    ghost: "ghost",
  };
  const sizeMap = {
    sm: "sm",
    md: "default",
  };

  return (
    <Button
      className={cn("font-medium", className)}
      variant={variantMap[variant] || "default"}
      size={sizeMap[size] || "default"}
      disabled={loading || disabled}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}

export function MetricTile({ icon: Icon, label, value, tone = "brand", detail }) {
  const iconTone = {
    brand: "bg-zinc-700/35 text-zinc-200",
    success: "bg-emerald-500/15 text-emerald-400",
    warning: "bg-amber-500/15 text-amber-400",
    danger: "bg-rose-500/15 text-rose-400",
    cyan: "bg-zinc-700/35 text-zinc-200"
  }[tone] || "bg-zinc-700/35 text-zinc-200";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-100">{value}</p>
            {detail ? <p className="mt-1 truncate text-xs text-slate-500">{detail}</p> : null}
          </div>
          {Icon ? (
            <div className={cn("grid size-11 place-items-center rounded-lg", iconTone)}>
              <Icon className="size-5" />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function InsightPanel({ title, detail, action, tone = "brand", toneLabel = "Insight" }) {
  return (
    <Card>
      <CardContent className="p-5">
        <StatusBadge tone={tone}>{toneLabel}</StatusBadge>
        <h3 className="mt-3 text-sm font-semibold text-slate-100">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-400">{detail}</p>
        {action}
      </CardContent>
    </Card>
  );
}

export function EmptyState({ title, text, action }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 bg-[#0a0a0a]/70 p-6 text-center">
      <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function FormField({ label, help, error, children }) {
  const fieldId = React.useId();
  const helpId = help ? `${fieldId}-help` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const canBindControl = React.isValidElement(children) && ["input", "select", "textarea"].includes(children.type);
  const control = canBindControl
    ? React.cloneElement(children, {
      id: children.props.id || fieldId,
      "aria-describedby": [children.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined
    })
    : children;

  return (
    <div className="block text-sm text-slate-300">
      {canBindControl ? (
        <label className="font-medium text-slate-200" htmlFor={children.props.id || fieldId}>{label}</label>
      ) : (
        <span className="font-medium text-slate-200">{label}</span>
      )}
      {help ? <span className="mt-1 block text-xs leading-5 text-slate-500" id={helpId}>{help}</span> : null}
      <div className="mt-2">{control}</div>
      {error ? <span className="mt-1 block text-xs text-rose-400" id={errorId}>{error}</span> : null}
    </div>
  );
}

export function DataTable({ columns, rows, getKey, renderMobileCard }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-slate-800 lg:block">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="sticky top-0 bg-[#0a0a0a]/95 backdrop-blur">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn("px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500", column.className)}
                  scope="col"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-black/20">
            {rows.map((row) => (
              <tr key={getKey(row)} className="transition hover:bg-slate-800/30">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn("px-4 py-3 align-top text-slate-300", column.cellClassName)}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderMobileCard ? (
        <div className="space-y-3 lg:hidden">
          {rows.map((row) => (
            <React.Fragment key={getKey(row)}>
              {renderMobileCard(row)}
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function toneForStatus(status) {
  return statusTone(status);
}
