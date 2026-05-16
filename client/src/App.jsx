import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  Loader2,
  MousePointerClick,
  RefreshCcw,
  Search,
  Send,
  Sparkles,
  X,
  Zap
} from "lucide-react";
import { AppShell, ActionButton, EmptyState, FormField, InsightPanel, MetricTile, Panel, StatusBadge } from "./ui/components.jsx";
import { viewMeta } from "./ui/tokens.js";

const periods = [
  { id: "7", label: "7 dias", days: 7 },
  { id: "30", label: "30 dias", days: 30 },
  { id: "90", label: "90 dias", days: 90 },
  { id: "month", label: "Este mes", mode: "month" },
  { id: "year", label: "Este ano", mode: "year" }
];

const dayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

export default function App() {
  const [state, setState] = useState(null);
  const [view, setView] = useState("overview");
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const inputRef = useRef(null);

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { "content-type": "application/json" },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async function refresh() {
    setRefreshing(true);
    try {
      setState(await api("/api/state"));
    } finally {
      setRefreshing(false);
    }
  }

  function toast(title, detail = "", tone = "success") {
    const id = crypto.randomUUID();
    setToasts((items) => [{ id, title, detail, tone }, ...items].slice(0, 4));
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4400);
  }

  async function action(key, fn, success) {
    setLoading((items) => ({ ...items, [key]: true }));
    try {
      const msg = await fn();
      await refresh();
      if (msg && typeof msg === "object" && msg.title) toast(msg.title, msg.detail || "", msg.tone || "success");
      else toast(typeof msg === "string" ? msg : success);
    } catch (error) {
      toast("Acao nao concluida", error.message, "error");
    } finally {
      setLoading((items) => ({ ...items, [key]: false }));
    }
  }

  useEffect(() => {
    refresh().catch((error) => toast("Erro ao carregar painel", error.message, "error"));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const imagesPending = useMemo(
    () => (state?.offers || []).some(o => o.imageStatus === "pending" || o.imageStatus === "generating"),
    [state?.offers]
  );

  useEffect(() => {
    if (!imagesPending) return;
    const id = setInterval(() => {
      fetch("/api/state").then(r => r.json()).then(setState).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [imagesPending]);

  const selectedPeriod = periods.find((item) => item.id === period) || periods[1];
  const data = useMemo(() => (state ? buildDashboardData(state, selectedPeriod) : null), [state, selectedPeriod]);

  if (!state || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="mr-3 size-5 animate-spin text-violet-400" />
        Carregando TDO Links...
      </div>
    );
  }

  const topBarActions = (
    <ActionButton
      aria-label="Atualizar"
      loading={refreshing}
      onClick={() => refresh().catch((error) => toast("Erro ao atualizar", error.message, "error"))}
    >
      <RefreshCcw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
      Atualizar
    </ActionButton>
  );

  return (
    <>
      <AppShell
        inputRef={inputRef}
        mobileOpen={isMobileOpen}
        setMobileOpen={setIsMobileOpen}
        setView={setView}
        topBar={{ actions: topBarActions }}
        view={view}
      >
        {view === "overview" && <Overview state={state} data={data} setPeriod={setPeriod} period={period} loading={loading} action={action} api={api} />}
        {view === "pipeline" && <PipelineView state={state} action={action} api={api} loading={loading} />}
        {view === "feed" && <FeedView state={state} />}
        {view === "rejected" && <RejectedView state={state} />}
        {view === "config" && <ConfigView state={state} loading={loading} action={action} api={api} />}
      </AppShell>
      <ToastStack toasts={toasts} setToasts={setToasts} />
    </>
  );
}

/* ─── Overview ─────────────────────────────────────────────────── */

function Overview({ state, data, setPeriod, period, loading, action, api }) {
  return (
    <div className="space-y-5 md:space-y-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={MousePointerClick}
          label="Cliques no periodo"
          value={data.clicksInPeriod}
          tone="brand"
          detail={`${data.clickRate}% por publicacao`}
        />
        <MetricTile
          icon={Send}
          label="Publicados"
          value={data.publishedInPeriod}
          tone="success"
          detail={`${state.metrics.published} no total`}
        />
        <MetricTile
          icon={CheckCircle2}
          label="Deals validados"
          value={data.validatedTotal}
          tone="cyan"
          detail={`${data.approvalRate}% taxa de aprovacao AI`}
        />
        <MetricTile
          icon={AlertTriangle}
          label="Rejeitados"
          value={data.rejectedTotal}
          tone={data.rejectedTotal > 0 ? "warning" : "success"}
          detail="pela validacao Claude"
        />
      </section>

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 xl:col-span-8">
          <Panel
            title="Atividade por horario"
            count="Cliques e publicacoes no periodo selecionado"
            action={
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
              >
                {periods.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            }
          >
            <Heatmap heatmap={data.heatmap} />
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-4 space-y-4">
          <InsightPanel
            tone={data.healthTone === "critical" ? "danger" : data.healthTone === "warning" ? "warning" : "success"}
            toneLabel={`${data.healthScore}/100 saude`}
            title="Pipeline autonomo"
            detail={`Proxima busca automatica em ate 2h. ${data.publishedInPeriod} publicacoes no periodo selecionado.`}
          />
          <Panel title="Forcar busca" count="Dispara o discovery manualmente">
            <p className="mb-4 text-sm text-slate-500">Usa o mesmo fluxo autonomo: Discovery → Validation → Creative → Publisher.</p>
            <ActionButton
              loading={loading.scrape}
              onClick={() => action("scrape", () => api("/api/run/scrape", { method: "POST" }), "Busca iniciada")}
            >
              <Search className="size-4" />
              Forcar busca agora
            </ActionButton>
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-5">
          <Panel title="Categorias e canais" count="Distribuicao do inventario">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
              <Bars title="Categorias" items={data.categoryBars} />
              <Bars title="Canais" items={data.channelBars} />
            </div>
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-7">
          <Panel title="Publicacoes recentes" count="Ultimos deals publicados pelo pipeline">
            <RecentPublications publishLog={state.publishLog || []} offers={state.offers || []} limit={8} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ─── Pipeline view ─────────────────────────────────────────────── */

const AGENTS = [
  {
    key: "discovery",
    name: "Discovery",
    description: "Amazon scraper + RSS Pelando/Zoom",
    icon: Search,
    schedule: "A cada 2h via cron"
  },
  {
    key: "validation",
    name: "Validation",
    description: "Claude Haiku 4.5 — threshold 70%",
    icon: CheckCircle2,
    schedule: "Por deal candidato"
  },
  {
    key: "creative",
    name: "Creative",
    description: "DALL-E 3 + Claude Sonnet — copy × 3 canais",
    icon: Sparkles,
    schedule: "Apos validacao aprovada"
  },
  {
    key: "publisher",
    name: "Publisher",
    description: "Telegram + Discord + X em paralelo",
    icon: Send,
    schedule: "Apos creative concluido"
  }
];

function PipelineView({ state, action, api, loading }) {
  const publishLog = state.publishLog || [];
  const offers = state.offers || [];
  const drafts = state.drafts || [];

  const publishedOfferIds = new Set(
    publishLog.filter(l => l.result?.ok).map(l => l.offerId)
  );
  const rejectedOffers = offers.filter(o =>
    ["rejected", "failed", "blocked"].includes(o.status)
  );

  const stats = {
    discovered: offers.length,
    validated: offers.filter(o => o.status !== "rejected" && o.status !== "blocked").length,
    published: publishedOfferIds.size,
    rejected: rejectedOffers.length
  };

  const lastPublish = publishLog.filter(l => l.result?.ok).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricTile icon={Search} label="Descobertos" value={stats.discovered} tone="brand" detail="no inventario" />
        <MetricTile icon={CheckCircle2} label="Validados" value={stats.validated} tone="cyan" detail="passaram na AI" />
        <MetricTile icon={Send} label="Publicados" value={stats.published} tone="success" detail="deals enviados" />
        <MetricTile icon={AlertTriangle} label="Rejeitados" value={stats.rejected} tone="warning" detail="pela validacao" />
      </section>

      <Panel title="Agentes do pipeline" count="Fluxo: Discovery → Validation → Creative → Publisher">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {AGENTS.map((agent) => {
            const Icon = agent.icon;
            return (
              <div key={agent.key} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-lg bg-violet-600/20 text-violet-400">
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{agent.name}</p>
                    <StatusBadge tone="success">Ativo</StatusBadge>
                  </div>
                </div>
                <p className="text-xs leading-5 text-slate-500">{agent.description}</p>
                <p className="mt-2 text-xs text-slate-600">{agent.schedule}</p>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-7">
          <Panel title="Atividade recente" count={`${publishLog.length} eventos no log`}>
            {publishLog.length === 0 ? (
              <EmptyState
                title="Sem publicacoes ainda"
                text="O pipeline publicara automaticamente quando encontrar deals validos."
              />
            ) : (
              <div className="space-y-2">
                {publishLog.slice(0, 15).map((entry, i) => {
                  const offer = offers.find(o => o.id === entry.offerId);
                  return (
                    <div key={entry.id || i} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2">
                      <div className={`size-2 rounded-full ${entry.result?.ok ? "bg-emerald-500" : "bg-rose-500"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-200">{offer?.title || entry.offerId || "Deal"}</p>
                        <p className="text-xs text-slate-500">{channelLabel(entry.channel)} • {entry.result?.providerMessageId ? `msg #${entry.result.providerMessageId}` : ""} • {entry.createdAt ? formatDate(entry.createdAt) : ""}</p>
                      </div>
                      <StatusBadge tone={entry.result?.ok ? "success" : "danger"}>{entry.result?.ok ? "ok" : "falhou"}</StatusBadge>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-5">
          <Panel title="Resumo do funil" count="Conversao por etapa">
            <div className="space-y-3">
              <FunnelStep label="Descobertos" value={stats.discovered} max={stats.discovered} tone="brand" />
              <FunnelStep label="Validados (AI)" value={stats.validated} max={stats.discovered} tone="cyan" />
              <FunnelStep label="Publicados" value={stats.published} max={stats.discovered} tone="success" />
              <FunnelStep label="Rejeitados" value={stats.rejected} max={stats.discovered} tone="danger" />
            </div>
            {lastPublish && (
              <p className="mt-4 text-xs text-slate-500">
                Ultima publicacao: {formatDate(lastPublish.createdAt)}
              </p>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        title="Imagens AI"
        count={`${offers.filter(o => o.generatedImagePath).length} geradas · ${offers.filter(o => o.imageStatus === "pending" || o.imageStatus === "generating").length} em processamento · pipeline: max 2 deals/ciclo`}
      >
        <ImageGenPanel offers={offers} action={action} api={api} loading={loading} />
      </Panel>
    </div>
  );
}

function ImageGenPanel({ offers, action, api, loading }) {
  const [now, setNow] = useState(Date.now());

  const active = offers.filter(o => o.imageStatus === "pending" || o.imageStatus === "generating");
  // "validated" status = in pipeline, image coming automatically — no button needed
  const needsManual = offers
    .filter(o =>
      !o.generatedImagePath &&
      o.imageStatus !== "pending" &&
      o.imageStatus !== "generating" &&
      o.status !== "validated" &&
      (o.imageStatus === "failed" || !o.imageStatus)
    )
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 8);
  const done = offers.filter(o => o.generatedImagePath).length;

  useEffect(() => {
    if (!active.length) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active.length]);

  if (offers.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma oferta no inventario ainda.</p>;
  }

  function progressFor(offer) {
    if (offer.imageStatus === "pending") return 5;
    if (offer.imageStatus === "generating") {
      const elapsed = offer.imageStatusUpdatedAt ? now - new Date(offer.imageStatusUpdatedAt).getTime() : 0;
      return Math.min(90, 10 + Math.round((elapsed / 28000) * 80));
    }
    return 0;
  }

  function stageLabel(offer) {
    if (offer.imageStatus === "pending") return "Na fila...";
    if (offer.imageStatus === "generating") {
      const elapsed = offer.imageStatusUpdatedAt ? now - new Date(offer.imageStatusUpdatedAt).getTime() : 0;
      if (elapsed < 8000) return "Analisando imagem original...";
      if (elapsed < 22000) return "Gerando com DALL-E 3...";
      return "Salvando imagem...";
    }
    return "";
  }

  return (
    <div className="space-y-2">
      {active.length > 0 && (
        <>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Em processamento</p>
          {active.map(offer => {
            const pct = progressFor(offer);
            return (
              <div key={offer.id} className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-violet-600/20 text-violet-400">
                    <Loader2 className="size-4 animate-spin" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">{offer.title}</p>
                    <p className="text-xs text-violet-400">{stageLabel(offer)}</p>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-800">
                      <div
                        className="h-1.5 rounded-full bg-violet-500 transition-all duration-1000"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{pct}% concluido — estimativa: ~30s total</p>
                  </div>
                </div>
              </div>
            );
          })}
          {needsManual.length > 0 && <div className="h-px bg-slate-800 my-3" />}
        </>
      )}

      {needsManual.length > 0 && (
        <>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Geracao manual ({needsManual.length} ofertas legadas)
          </p>
          {needsManual.map(offer => (
            <div key={offer.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
              {offer.imageUrl ? (
                <img src={offer.imageUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-700" />
              ) : (
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-600">
                  <ImageIcon className="size-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-200">{offer.title}</p>
                {offer.imageStatus === "failed" && (
                  <p className="text-xs text-rose-400">Falhou na geracao anterior</p>
                )}
              </div>
              <ActionButton
                size="sm"
                variant="outline"
                loading={loading[`img_${offer.id}`]}
                onClick={() => action(`img_${offer.id}`, () => api(`/api/offers/${offer.id}/generate-image`, { method: "POST" }), "Geracao iniciada")}
              >
                <Sparkles className="size-3.5" />
                {offer.imageStatus === "failed" ? "Tentar novamente" : "Gerar AI"}
              </ActionButton>
            </div>
          ))}
        </>
      )}

      {active.length === 0 && noImage.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
          <div>
            <p className="text-sm font-medium text-emerald-300">Todas as imagens geradas</p>
            <p className="text-xs text-slate-500">{done} ofertas com imagem AI profissional</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FunnelStep({ label, value, max, tone }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  const barColors = {
    brand: "bg-violet-500",
    cyan: "bg-cyan-500",
    success: "bg-emerald-500",
    danger: "bg-rose-500",
    warning: "bg-amber-500"
  };
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-medium text-slate-300">{value} <span className="text-slate-600">({percent}%)</span></span>
      </div>
      <div className="h-2 rounded-full bg-slate-800">
        <div className={`h-2 rounded-full transition-all ${barColors[tone] || "bg-violet-500"}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/* ─── Feed view ─────────────────────────────────────────────────── */

function FeedView({ state }) {
  const publishLog = state.publishLog || [];
  const offers = state.offers || [];
  const [channelFilter, setChannelFilter] = useState("all");

  const channels = ["all", "telegram", "discord", "x"];

  const filtered = publishLog
    .filter(l => l.result?.ok)
    .filter(l => channelFilter === "all" || l.channel === channelFilter)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {channels.map(ch => (
          <button
            key={ch}
            type="button"
            onClick={() => setChannelFilter(ch)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              channelFilter === ch
                ? "border-violet-500/50 bg-violet-600/20 text-violet-300"
                : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            {ch === "all" ? "Todos" : channelLabel(ch)}
          </button>
        ))}
        <span className="ml-auto text-sm text-slate-500">{filtered.length} publicacoes</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhuma publicacao"
          text="O pipeline publicara automaticamente quando deals passarem na validacao."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((entry, i) => {
            const offer = offers.find(o => o.id === entry.offerId);
            return (
              <article key={entry.id || i} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-start gap-4">
                  {offer?.imageUrl || offer?.generatedImagePath ? (
                    <img
                      src={offer.generatedImagePath ? `/api/offers/${offer.id}/image` : offer.imageUrl}
                      alt={offer.title}
                      className="size-14 shrink-0 rounded-lg object-cover ring-1 ring-slate-700"
                    />
                  ) : (
                    <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-600">
                      <Zap className="size-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <StatusBadge tone="success">{channelLabel(entry.channel)}</StatusBadge>
                      {entry.result?.providerMessageId && (
                        <span className="text-xs text-slate-500">msg #{entry.result.providerMessageId}</span>
                      )}
                      <span className="ml-auto text-xs text-slate-500">{formatDate(entry.createdAt)}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-100">{offer?.title || entry.offerId}</p>
                    {offer?.currentPrice && (
                      <p className="mt-1 text-xs text-slate-500">
                        {money(offer.currentPrice)}
                        {offer.discountPercent ? ` — ${Math.round(offer.discountPercent)}% off` : ""}
                        {offer.store ? ` • ${offer.store}` : ""}
                      </p>
                    )}
                  </div>
                  {offer?.originalUrl && (
                    <a
                      href={offer.originalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Rejected view ──────────────────────────────────────────────── */

function RejectedView({ state }) {
  const offers = state.offers || [];
  const drafts = state.drafts || [];

  const rejected = [
    ...offers
      .filter(o => ["rejected", "blocked", "failed"].includes(o.status))
      .map(o => ({ type: "offer", item: o, reason: o.validationSummary || o.rejectionReason || "Sem motivo registrado", at: o.updatedAt || o.createdAt })),
    ...drafts
      .filter(d => ["rejected", "failed", "blocked"].includes(d.status))
      .map(d => {
        const offer = offers.find(o => o.id === d.offerId);
        return { type: "draft", item: d, offer, reason: d.rejectionReason || "Sem motivo registrado", at: d.updatedAt || d.createdAt };
      })
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{rejected.length} deals descartados</p>
      </div>

      {rejected.length === 0 ? (
        <EmptyState
          title="Sem rejeicoes"
          text="Deals rejeitados pela validacao Claude aparecerao aqui com o motivo."
        />
      ) : (
        <div className="space-y-3">
          {rejected.map((entry, i) => {
            const title = entry.type === "offer"
              ? entry.item.title
              : entry.offer?.title || entry.item.text?.slice(0, 80) || "Draft";
            return (
              <article key={entry.item.id || i} className="rounded-xl border border-rose-500/10 bg-slate-900 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-400">
                    <AlertTriangle className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <StatusBadge tone="danger">{statusLabel(entry.item.status)}</StatusBadge>
                      <span className="text-xs text-slate-500">{entry.at ? formatDate(entry.at) : ""}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-100">{title}</p>
                    <p className="mt-1 text-sm leading-5 text-rose-300/70">{entry.reason}</p>
                    {entry.type === "offer" && entry.item.currentPrice && (
                      <p className="mt-1 text-xs text-slate-500">
                        {money(entry.item.currentPrice)} • {entry.item.store || ""}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Config view ───────────────────────────────────────────────── */

function ConfigView({ state, loading, action, api }) {
  const telegram = state.diagnostics?.telegram;
  const configInputClass = "h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition";

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatusLine label="Telegram" value={telegram?.ready ? "Pronto" : "Revisar"} tone={telegram?.ready ? "success" : "warning"} />
        <StatusLine label="Modo de envio" value={telegram?.dryRun ? "Dry-run (teste)" : "Envio real"} tone={telegram?.dryRun ? "warning" : "success"} />
        <StatusLine label="Saude" value={`${state.metrics?.published || 0} publicados`} tone="brand" />
      </section>

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 xl:col-span-5 space-y-5">

          <Panel title="Pipeline AI" count="Configuracoes de validacao autonoma">
            <div className="space-y-4">
              <FormField label="Threshold de confianca" help="Minimo para o Claude aprovar um deal (0-100). Padrao: 70.">
                <input
                  type="number"
                  min="0"
                  max="100"
                  className={configInputClass}
                  defaultValue={state.settings?.aiConfidenceThreshold || 70}
                  onBlur={(e) => action("threshold", () => api("/api/settings", { method: "POST", body: { aiConfidenceThreshold: Number(e.target.value) } }), "Threshold atualizado")}
                />
              </FormField>
              <FormField label="Modo de publicacao" help="Controla a autonomia do pipeline.">
                <select
                  className={configInputClass}
                  defaultValue={state.settings?.mode || "limited"}
                  onChange={(e) => action("mode", () => api("/api/settings", { method: "POST", body: { mode: e.target.value } }), "Modo atualizado")}
                >
                  <option value="limited">Automatico limitado</option>
                  <option value="manual">Manual</option>
                  <option value="paused">Pausado</option>
                </select>
              </FormField>
            </div>
          </Panel>

          <Panel title="Telegram" count={telegram?.ready ? "Configurado" : "Revisar credenciais"}>
            <div className="space-y-2 text-sm text-slate-400">
              <div className="flex justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <span>Bot token</span>
                <StatusBadge tone={telegram?.hasBotToken ? "success" : "danger"}>{telegram?.hasBotToken ? "Ok" : "Ausente"}</StatusBadge>
              </div>
              <div className="flex justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <span>Chat ID</span>
                <StatusBadge tone={telegram?.hasChatId ? "success" : "danger"}>{telegram?.hasChatId ? "Ok" : "Ausente"}</StatusBadge>
              </div>
              <div className="flex justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <span>Modo</span>
                <StatusBadge tone={telegram?.dryRun ? "warning" : "success"}>{telegram?.dryRun ? "Dry-run" : "Real"}</StatusBadge>
              </div>
            </div>
            <ActionButton
              className="mt-4"
              variant="outline"
              loading={loading.telegramTest}
              onClick={() => action("telegramTest", () => api("/api/integrations/telegram/test", { method: "POST" }), "Telegram testado")}
            >
              <Send className="size-4" /> Testar Telegram
            </ActionButton>
          </Panel>

          <Panel title="Discord">
            <FormField label="Webhook URL">
              <input
                type="text"
                className={configInputClass}
                placeholder="https://discord.com/api/webhooks/..."
                defaultValue={state.integrations?.discord?.webhookUrl || ""}
                onBlur={(e) => action("discordWebhookSave", () => api("/api/integrations/discord/settings", { method: "PUT", body: { webhookUrl: e.target.value } }), "Webhook Discord salvo")}
              />
            </FormField>
            <ActionButton
              className="mt-4"
              variant="outline"
              loading={loading.discordTest}
              onClick={() => action("discordTest", async () => {
                const data = await api("/api/integrations/discord/test", { method: "POST" });
                if (!data.ok) throw new Error(data.detail);
              }, "Discord: mensagem enviada")}
            >
              <Send className="size-4" /> Testar Discord
            </ActionButton>
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-7 space-y-5">
          <Panel title="Busca automatica" count="Cron a cada 2h — Amazon + RSS Pelando/Zoom">
            <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
                <StatusLine label="RSS Pelando" value="Ativo" tone="success" />
                <StatusLine label="RSS Zoom" value="Ativo" tone="success" />
                <StatusLine label="Amazon scraper" value="Ativo" tone="success" />
              </div>
            </div>
            <FormField label="URLs Amazon adicionais" help="Uma URL por linha para buscas personalizadas.">
              <textarea
                className="min-h-28 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
                defaultValue={(state.discovery?.amazon?.sourceUrls || []).join("\n")}
                placeholder="https://www.amazon.com.br/s?k=ssd+nvme"
                onBlur={(e) => action("discoveryUrls", () => api("/api/discovery/amazon/settings", {
                  method: "PUT",
                  body: { sourceUrls: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) }
                }), "URLs salvas")}
              />
            </FormField>
          </Panel>

          <Panel title="Affiliate Tags" count="Tags Amazon por canal">
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Tag Telegram">
                <input type="text" className={configInputClass} defaultValue={state.settings?.amazonAffiliateTagTelegram || ""} onBlur={(e) => action("tagTg", () => api("/api/settings", { method: "POST", body: { amazonAffiliateTagTelegram: e.target.value } }), "Tag Telegram salva")} placeholder="seu-tag-telegram-20" />
              </FormField>
              <FormField label="Tag X (Twitter)">
                <input type="text" className={configInputClass} defaultValue={state.settings?.amazonAffiliateTagX || ""} onBlur={(e) => action("tagX", () => api("/api/settings", { method: "POST", body: { amazonAffiliateTagX: e.target.value } }), "Tag X salva")} placeholder="seu-tag-x-20" />
              </FormField>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared components ─────────────────────────────────────────── */

function RecentPublications({ publishLog, offers, limit = 8 }) {
  const recent = publishLog
    .filter(l => l.result?.ok)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);

  if (recent.length === 0) {
    return <EmptyState title="Sem publicacoes" text="O pipeline publicara automaticamente quando encontrar deals validos." />;
  }

  return (
    <div className="space-y-2">
      {recent.map((entry, i) => {
        const offer = offers.find(o => o.id === entry.offerId);
        return (
          <div key={entry.id || i} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2.5">
            <Activity className="size-3.5 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-200">{offer?.title || entry.offerId}</p>
              <p className="text-xs text-slate-500">{channelLabel(entry.channel)} • {formatDate(entry.createdAt)}</p>
            </div>
            <StatusBadge tone="success">{channelLabel(entry.channel)}</StatusBadge>
          </div>
        );
      })}
    </div>
  );
}

function StatusLine({ label, value, tone = "neutral" }) {
  const toneClass = {
    brand: "border-violet-500/20 bg-violet-500/10 text-violet-300",
    cyan: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
    muted: "border-slate-700 bg-slate-800/40 text-slate-400",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    danger: "border-rose-500/20 bg-rose-500/10 text-rose-300",
    neutral: "border-slate-700 text-slate-200"
  }[tone] || "border-slate-700 text-slate-200";

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs opacity-75">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function Heatmap({ heatmap }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-[44px_repeat(24,minmax(0,1fr))] gap-1">
        <div />
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} className="text-center text-[10px] text-slate-600">{hour}</div>
        ))}
        {heatmap.map((row, day) => (
          <React.Fragment key={day}>
            <div className="text-xs text-slate-600">{dayLabels[day]}</div>
            {row.map((value, hour) => (
              <div
                key={hour}
                className={`h-6 rounded-md border ${heatClass(intensity(value, heatmap.max))}`}
                title={`${value} atividades`}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function Bars({ title, items }) {
  return (
    <div>
      <h4 className="mb-4 text-sm font-medium text-slate-300">{title}</h4>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>{item.label}</span><span>{item.value}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800">
              <div className={`h-2 rounded-full ${barClass(item.tone)}`} style={{ width: `${item.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToastStack({ toasts, setToasts }) {
  return (
    <div className="fixed bottom-5 right-5 z-[99999] grid w-[min(380px,calc(100vw-40px))] gap-3">
      {toasts.map((item) => (
        <div
          key={item.id}
          className={`flex items-start justify-between gap-3 rounded-xl border bg-slate-900 p-4 shadow-xl ${
            item.tone === "error" ? "border-rose-500/30 text-rose-300" : "border-emerald-500/30 text-emerald-300"
          }`}
        >
          <div>
            <p className="text-sm font-semibold">{item.title}</p>
            {item.detail ? <p className="mt-1 text-sm opacity-80">{item.detail}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setToasts((items) => items.filter((t) => t.id !== item.id))}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Data helpers ──────────────────────────────────────────────── */

function buildDashboardData(state, selectedPeriod) {
  const since = periodStart(selectedPeriod);
  const inPeriod = (date) => !since || (date && new Date(date) >= since);
  const clicks = state.clicks.filter((click) => inPeriod(click.timestamp));
  const publishLog = state.publishLog || [];
  const publishedInPeriod = publishLog.filter(l => l.result?.ok && inPeriod(l.createdAt));
  const offers = state.offers || [];
  const rejected = offers.filter(o => ["rejected", "failed", "blocked"].includes(o.status));
  const validated = offers.filter(o => o.status !== "rejected" && o.status !== "blocked");
  const clickRate = Math.round((clicks.length / Math.max(publishedInPeriod.length, 1)) * 100);
  const approvalRate = offers.length > 0 ? Math.round((validated.length / offers.length) * 100) : 0;
  const healthScore = Math.min(100, Math.max(0, 60 + Math.min(publishedInPeriod.length * 5, 30) + (approvalRate > 50 ? 10 : 0)));
  const healthTone = healthScore >= 80 ? "green" : healthScore >= 55 ? "warning" : "critical";
  const heatmap = buildHeatmap([...clicks.map((c) => c.timestamp), ...publishedInPeriod.map((l) => l.createdAt)].filter(Boolean));
  const channelBars = buildBars(countBy(publishLog.filter(l => l.result?.ok), l => channelLabel(l.channel)), () => "brand");
  const categoryBars = buildBars(countBy(offers, o => o.category || "tech"), () => "success");

  return {
    clicksInPeriod: clicks.length,
    publishedInPeriod: publishedInPeriod.length,
    validatedTotal: validated.length,
    rejectedTotal: rejected.length,
    approvalRate,
    clickRate,
    healthScore,
    healthTone,
    heatmap,
    channelBars,
    categoryBars
  };
}

function periodStart(period) {
  const now = new Date();
  if (period.mode === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period.mode === "year") return new Date(now.getFullYear(), 0, 1);
  const date = new Date(now);
  date.setDate(date.getDate() - period.days);
  return date;
}

function buildHeatmap(timestamps) {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  timestamps.forEach((timestamp) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return;
    const day = (date.getDay() + 6) % 7;
    grid[day][date.getHours()] += 1;
  });
  grid.max = Math.max(0, ...grid.flat());
  return grid;
}

function buildBars(counts, toneForLabel) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1;
  return entries.map(([label, value]) => ({
    label,
    value,
    percent: Math.round((value / total) * 100),
    tone: toneForLabel(label)
  }));
}

function countBy(items, fn) {
  return items.reduce((acc, item) => {
    const key = fn(item) || "Outros";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function channelLabel(channel) {
  return { telegram: "Telegram", discord: "Discord", x: "Twitter/X", admin: "Admin" }[channel] || channel || "Canal";
}

function statusLabel(status) {
  return {
    auto_ready: "Pronto", needs_review: "Revisao", approved: "Aprovado",
    published: "Publicado", archived: "Arquivado", rejected: "Rejeitado",
    failed: "Falhou", blocked: "Bloqueado"
  }[status] || status;
}

function formatDate(value) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function intensity(count, max) { return max ? Math.ceil((count / max) * 5) : 0; }

function heatClass(level) {
  return [
    "border-slate-800 bg-slate-800",
    "border-violet-500/20 bg-violet-500/10",
    "border-violet-500/30 bg-violet-500/20",
    "border-violet-500/40 bg-violet-500/40",
    "border-violet-500/60 bg-violet-500/60",
    "border-violet-400 bg-violet-500"
  ][level] || "border-slate-800 bg-slate-800";
}

function barClass(tone) {
  return {
    success: "bg-emerald-500",
    brand: "bg-violet-500",
    cyan: "bg-cyan-500",
    danger: "bg-rose-500",
    warning: "bg-amber-500"
  }[tone] || "bg-violet-500";
}
