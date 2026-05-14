import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Box,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  MousePointerClick,
  Package,
  RefreshCcw,
  Search,
  Send,
  X,
  Zap
} from "lucide-react";
import { AppShell, ActionButton, DataTable, EmptyState as DesignEmptyState, FormField, InsightPanel, MetricTile, Panel, QueueColumn, StatusBadge } from "./ui/components.jsx";
import { viewMeta } from "./ui/tokens.js";

const periods = [
  { id: "7", label: "7 dias", days: 7 },
  { id: "30", label: "30 dias", days: 30 },
  { id: "90", label: "90 dias", days: 90 },
  { id: "month", label: "Este mes", mode: "month" },
  { id: "year", label: "Este ano", mode: "year" }
];

const draftColumns = [
  ["auto_ready", "Pronto", "success"],
  ["needs_review", "Revisao", "warning"],
  ["approved", "Aprovado", "brand"],
  ["published", "Publicado", "cyan"],
  ["problem", "Problema", "danger"]
];

const dayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

export default function App() {
  const [state, setState] = useState(null);
  const [view, setView] = useState("overview");
  const [period, setPeriod] = useState("30");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState({});
  const [toasts, setToasts] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
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
    setState(await api("/api/state"));
  }

  function toast(title, detail = "", tone = "success") {
    const id = crypto.randomUUID();
    setToasts((items) => [{ id, title, detail, tone }, ...items].slice(0, 4));
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4400);
  }

  async function action(key, fn, success) {
    setLoading((items) => ({ ...items, [key]: true }));
    try {
      await fn();
      await refresh();
      toast(success);
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
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

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

  const selectedPeriod = periods.find((item) => item.id === period) || periods[1];
  const data = useMemo(() => (state ? buildDashboardData(state, selectedPeriod) : null), [state, selectedPeriod]);
  const drafts = useMemo(() => state ? state.drafts.filter((draft) => {
    const offer = state.offers.find((item) => item.id === draft.offerId);
    return matches(`${draft.channel} ${draft.status} ${draft.text} ${offer?.title || ""}`, query);
  }) : [], [state, query]);
  const offers = useMemo(() => state ? state.offers.filter((offer) => matches(`${offer.store} ${offer.status} ${offer.title} ${offer.category}`, query)) : [], [state, query]);

  if (!state || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-700 dark:bg-gray-950 dark:text-gray-300">
        <Loader2 className="mr-3 size-5 animate-spin text-brand-500" />
        Carregando TDO Links Admin...
      </div>
    );
  }

  const activeViewMeta = viewMeta[view] || viewMeta.overview;
  const topBarActions = (
    <ActionButton
      aria-label={`Atualizar ${activeViewMeta.title}`}
      onClick={() => refresh().catch((error) => toast("Erro ao atualizar", error.message, "error"))}
    >
      <RefreshCcw className="size-4" />
      Atualizar
    </ActionButton>
  );

  return (
    <>
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
      <ToastStack toasts={toasts} setToasts={setToasts} />
    </>
  );
}

function Overview({ state, data, setPeriod, period, setView }) {
  const telegram = state.diagnostics?.telegram;
  const discovery = state.discovery?.amazon;
  const healthTone = data.healthTone === "critical" ? "danger" : data.healthTone === "warning" ? "warning" : "success";
  const insightTone = data.rec.title.includes("pendente") ? "danger" : data.rec.title.includes("prontas") ? "success" : data.rec.title.includes("Revisao") ? "warning" : "brand";

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
          label="Ofertas prontas"
          value={data.ready}
          tone="cyan"
          detail={`${data.autoReady} prontas para publicar`}
        />
        <MetricTile
          icon={AlertTriangle}
          label="Ofertas bloqueadas"
          value={data.blocked}
          tone={data.blocked ? "danger" : "success"}
          detail={`${data.missingAffiliate} links pendentes`}
        />
      </section>

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 xl:col-span-8">
          <Panel
            title="Atividade por horario"
            count="Cliques e publicacoes no periodo selecionado"
            action={(
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none tdo-focus dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {periods.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            )}
          >
            <Heatmap heatmap={data.heatmap} />
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-4">
          <InsightPanel
            tone={insightTone}
            toneLabel={`${data.healthScore}/100 saude`}
            title={data.rec.title}
            detail={data.rec.text}
            action={(
              <ActionButton className="mt-4" onClick={() => setView(data.rec.action.view)}>
                <ExternalLink className="size-4" />
                {data.rec.action.label}
              </ActionButton>
            )}
          />
        </div>

        <div className="col-span-12 xl:col-span-5">
          <Panel title="Categorias e canais" count="Onde a oportunidade esta concentrada">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
              <Bars title="Categorias" items={data.categoryBars} />
              <Bars title="Canais" items={data.channelBars} />
            </div>
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-7">
          <Panel
            title="Melhores oportunidades"
            count={`${data.topOffers.length} ofertas por score`}
            action={(
              <ActionButton variant="outline" onClick={() => setView("offers")}>
                Ver ofertas
              </ActionButton>
            )}
          >
            <OfferTable offers={data.topOffers} clicksByOffer={state.metrics.clicksByOffer} />
          </Panel>
        </div>
      </div>

      <Panel title="Saude operacional" count="Estado rapido do sistema">
        <div className="grid gap-3 md:grid-cols-4">
          <StatusLine label="Health score" value={`${data.healthScore}/100`} tone={healthTone} />
          <StatusLine label="Telegram" value={telegram ? (telegram.ready ? "Pronto" : "Revisar") : "Indisponivel"} tone={telegram?.ready ? "success" : "warning"} />
          <StatusLine label="Descoberta" value={discovery?.enabled ? "Ativa" : "Pausada"} tone={discovery?.enabled ? "success" : "warning"} />
          <StatusLine label="Backlog afiliado" value={`${data.missingAffiliate} pendentes`} tone={data.missingAffiliate ? "danger" : "success"} />
        </div>
      </Panel>
    </div>
  );
}

function Operation({ state, data, drafts, loading, api, action }) {
  return (
    <div className="space-y-4 md:space-y-6">
      <ActionPanel data={data} loading={loading} api={api} action={action} />
      <div className="grid gap-4 xl:grid-cols-3">
        {draftColumns.map(([column, title, tone]) => {
          const columnDrafts = drafts.filter((draft) => draftColumn(draft) === column);
          return (
            <QueueColumn key={column} title={title} count={`${columnDrafts.length}`} tone={tone}>
              {columnDrafts.map((draft) => {
                const offer = state.offers.find((item) => item.id === draft.offerId);
                return <DraftCard key={draft.id} draft={draft} offer={offer} loading={loading} api={api} action={action} />;
              })}
              {!columnDrafts.length ? <EmptyState title="Fila vazia" text="Nenhum draft neste status." /> : null}
            </QueueColumn>
          );
        })}
      </div>
    </div>
  );
}

function ActionPanel({ data, loading, api, action }) {
  return (
    <Panel
      title="Comandos"
      count={`${data.pending} drafts pendentes`}
      density="compact"
      action={<StatusBadge tone={data.pending ? "warning" : "success"}>{data.pending ? "Acao pendente" : "Fila estavel"}</StatusBadge>}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:flex xl:flex-wrap">
          <ActionButton size="sm" loading={loading.scrape} onClick={() => action("scrape", () => api("/api/run/scrape", { method: "POST" }), "Ofertas coletadas")}>
            <Search className="size-4" /> Buscar ofertas
          </ActionButton>
          <ActionButton size="sm" loading={loading.publish} onClick={() => action("publish", () => api("/api/run/publish", { method: "POST" }), "Publicacao executada")}>
            <Send className="size-4" /> Publicar elegiveis
          </ActionButton>
          <ActionButton size="sm" variant="outline" loading={loading.report} onClick={() => action("report", () => api("/api/run/report", { method: "POST" }), "Relatorio gerado")}>
            <BarChart3 className="size-4" /> Gerar relatorio
          </ActionButton>
          <ActionButton size="sm" variant="outline" loading={loading.refreshAffiliates} onClick={() => action("refreshAffiliates", () => api("/api/run/refresh-affiliates", { method: "POST" }), "Links recalculados")}>
            <RefreshCcw className="size-4" /> Recalcular afiliados
          </ActionButton>
        </div>
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400 xl:max-w-md">
          Sem envio no Telegram? Revise Configuracao/Railway:{" "}
          <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">TELEGRAM_DRY_RUN=false</code>
          {", token e chat id preenchidos."}
        </p>
      </div>
    </Panel>
  );
}

function DraftCard({ draft, offer, loading, api, action }) {
  const [text, setText] = useState(draft.text);
  const [affiliateUrl, setAffiliateUrl] = useState(offer?.affiliateSource === "manual" ? offer.affiliateUrl || "" : "");
  useEffect(() => setText(draft.text), [draft.text]);
  useEffect(() => setAffiliateUrl(offer?.affiliateSource === "manual" ? offer.affiliateUrl || "" : ""), [offer?.affiliateUrl, offer?.affiliateSource]);
  const actions = draftActionsForStatus(draft.status);
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/55 dark:shadow-none dark:hover:border-slate-700">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge tone={statusBadgeTone(draft.status)}>{statusLabel(draft.status)}</StatusBadge>
            {offer?.source === "amazon_discovery" ? <StatusBadge tone="cyan">Descoberta Amazon</StatusBadge> : null}
            {offer?.source === "amazon_discovery" && !offer.affiliateReady ? <StatusBadge tone="warning">Link oficial pendente</StatusBadge> : null}
          </div>
          <h4 className="mt-2 line-clamp-2 text-sm font-semibold text-slate-950 dark:text-slate-100">{offer?.title || "Post de aquisicao X"}</h4>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{channelLabel(draft.channel)} {offer ? `- ${money(offer.currentPrice)}` : ""}</p>
          {offer?.discoverySource ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {offer.discoverySourceType === "term" ? "Termo" : "URL"}: {offer.discoverySource}
            </p>
          ) : null}
          {offer?.validationSummary ? (
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{offer.validationSummary}</p>
          ) : null}
          {offer?.scoreBreakdown ? (
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Confianca {offer.scoreBreakdown.reliability}</span>
              <span>Atratividade {offer.scoreBreakdown.attractiveness}</span>
              <span>Potencial {offer.scoreBreakdown.potential}</span>
              <span>Historico {offer.scoreBreakdown.performance}</span>
            </div>
          ) : null}
        </div>
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {draft.channel === "x" ? <Zap className="size-4" /> : <Send className="size-4" />}
        </div>
      </div>
      <textarea
        aria-label={`Texto do draft para ${offer?.title || channelLabel(draft.channel)}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={6}
        className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-5 text-slate-700 outline-none tdo-focus dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
      />
      {draft.warnings?.length ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300">
          {draft.warnings.map(warningLabel).join(" ")}
        </div>
      ) : null}
      {draft.rejectionReason ? <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-300">{draft.rejectionReason}</p> : null}
      {offer ? (
        <div className={`mt-3 rounded-xl border p-3 ${offer.affiliateReady ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-400/20 dark:bg-emerald-500/10" : "border-amber-300 bg-amber-50 shadow-[inset_3px_0_0_rgb(245_158_11)] dark:border-amber-400/30 dark:bg-amber-500/10"}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">Link afiliado oficial</span>
            <StatusBadge tone={offer.affiliateReady ? "success" : "warning"}>{offer.affiliateReady ? "Afiliado pronto" : "Pendente"}</StatusBadge>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              aria-label={`Link afiliado oficial para ${offer.title}`}
              value={affiliateUrl}
              onChange={(event) => setAffiliateUrl(event.target.value)}
              placeholder="Cole o link do SiteStripe ou amzn.to"
              className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none tdo-focus dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
            <ActionButton
              size="sm"
              className="h-10 sm:w-auto"
              variant="outline"
              loading={loading[`affiliate-${offer.id}`]}
              disabled={!affiliateUrl.trim()}
              onClick={() => action(`affiliate-${offer.id}`, () => api(`/api/offers/${offer.id}/affiliate`, { method: "POST", body: { affiliateUrl } }), "Link afiliado salvo")}
            >
              Salvar link
            </ActionButton>
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.includes("approve") ? <ActionButton size="sm" loading={loading[`approve-${draft.id}`]} onClick={() => action(`approve-${draft.id}`, () => api(`/api/drafts/${draft.id}/approve`, { method: "POST" }), "Draft aprovado")}><CheckCircle2 className="size-4" /> Aprovar</ActionButton> : null}
        {actions.includes("edit") ? <ActionButton size="sm" variant="outline" loading={loading[`edit-${draft.id}`]} onClick={() => action(`edit-${draft.id}`, () => api(`/api/drafts/${draft.id}/edit`, { method: "POST", body: { text } }), "Draft salvo")}><FileText className="size-4" /> Salvar</ActionButton> : null}
        {actions.includes("regenerate") ? <ActionButton size="sm" variant="outline" loading={loading[`regen-${draft.id}`]} onClick={() => action(`regen-${draft.id}`, () => api(`/api/drafts/${draft.id}/regenerate`, { method: "POST" }), "Texto regenerado")}><RefreshCcw className="size-4" /> Regenerar</ActionButton> : null}
        {actions.includes("clone") ? <ActionButton size="sm" variant="outline" loading={loading[`clone-${draft.id}`]} onClick={() => action(`clone-${draft.id}`, () => api(`/api/drafts/${draft.id}/clone`, { method: "POST" }), "Draft duplicado")}><Copy className="size-4" /> Clonar</ActionButton> : null}
        {actions.includes("reject") ? <ActionButton size="sm" variant="danger" loading={loading[`reject-${draft.id}`]} onClick={() => action(`reject-${draft.id}`, () => api(`/api/drafts/${draft.id}/reject`, { method: "POST", body: { reason: "Rejeitado no dashboard." } }), "Draft rejeitado")}><X className="size-4" /> Rejeitar</ActionButton> : null}
      </div>
    </article>
  );
}

function Offers({ state, data, offers, loading, api, action }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile label="Prontas" value={data.autoReady} tone="success" detail="Elegiveis para publicar" />
        <MetricTile label="Afiliado pendente" value={data.missingAffiliate} tone={data.missingAffiliate ? "warning" : "success"} detail="Links oficiais faltando" />
        <MetricTile label="Total" value={offers.length} tone="brand" detail="Inventario filtrado" />
        <MetricTile label="Publicadas" value={state.metrics.published} tone="cyan" detail="Historico de envios" />
      </div>
      <Panel
        title="Inventario de ofertas"
        count={`${offers.length} ofertas`}
        density="compact"
        action={<StatusBadge tone={data.missingAffiliate ? "warning" : "success"}>{data.missingAffiliate} afiliado pendente</StatusBadge>}
      >
        <OfferTable offers={offers} clicksByOffer={state.metrics.clicksByOffer} loading={loading} api={api} action={action} />
      </Panel>
    </div>
  );
}

function Reports({ state, data, loading, api, action }) {
  const recommendations = state.recommendations || data.recommendations || [];
  const reports = state.reports || [];
  const reportTone = data.healthTone === "critical" ? "danger" : data.healthTone === "warning" ? "warning" : "success";

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12 xl:col-span-4">
        <Panel
          title="Analise operacional"
          count={`${data.healthScore}/100 saude do funil`}
          action={<StatusBadge tone={reportTone}>{data.healthTone === "critical" ? "Critico" : data.healthTone === "warning" ? "Atencao" : "Estavel"}</StatusBadge>}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                Relatorios analisam cliques, categorias, gargalos do funil e proximas acoes para gerar trafego afiliado seguro.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/30">
                <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Recomendacoes</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{recommendations.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/30">
                <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Historico</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{reports.length}</p>
              </div>
            </div>
            <ActionButton
              className="w-full"
              loading={loading.report}
              onClick={() => action("report", () => api("/api/run/report", { method: "POST" }), "Relatorio gerado")}
            >
              <BarChart3 className="size-4" />
              Gerar analise
            </ActionButton>
          </div>
        </Panel>
      </div>
      <div className="col-span-12 xl:col-span-8">
        <Panel title="Recomendacoes operacionais" count={`${recommendations.length} proximas acoes`}>
          <div className="grid gap-3 md:grid-cols-2">
            {recommendations.map((rec) => (
              <InsightPanel
                key={rec.id}
                tone={recommendationTone(rec.severity)}
                toneLabel="Recomendacao"
                title={rec.title}
                detail={rec.detail}
              />
            ))}
          </div>
          {!recommendations.length ? (
            <DesignEmptyState
              title="Sem recomendacoes"
              text="Gere uma analise para receber novas recomendacoes."
            />
          ) : null}
        </Panel>
      </div>
      <div className="col-span-12">
        <Panel title="Historico de relatorios" count={`${reports.length} analises geradas`}>
          <div className="space-y-4">
            {reports.length ? reports.map((report) => (
              <article key={report.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/35">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <span className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{report.period}</span>
                  <StatusBadge tone="cyan">Relatorio IA</StatusBadge>
                </div>
                <h4 className="mt-3 break-words text-sm font-semibold leading-6 text-slate-950 dark:text-slate-100">{report.expectedImpact}</h4>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{Array.isArray(report.conclusions) ? report.conclusions.join(" ") : ""}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{Array.isArray(report.suggestions) ? report.suggestions.join(" ") : ""}</p>
              </article>
            )) : (
              <DesignEmptyState
                title="Nenhum relatorio"
                text="Gere uma analise para popular este painel."
              />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function recommendationTone(severity) {
  if (severity === "critical") return "danger";
  if (severity === "success") return "success";
  if (severity === "warning") return "warning";
  return "brand";
}

function Config({ state, data, loading, api, action }) {
  const telegram = state.diagnostics?.telegram;
  const telegramCount = telegram ? (telegram.ready ? "Pronto" : "Revisar") : "Aguardando diagnostico";
  const telegramValue = (value, availableLabel, missingLabel) => telegram ? (value ? availableLabel : missingLabel) : "Indisponivel";
  const discovery = state.discovery?.amazon || {
    enabled: true,
    intervalHours: 2,
    minScore: 70,
    maxCandidatesPerRun: 10,
    sourceUrls: [],
    searchTerms: [],
    lastRun: null,
    nextRunAt: null
  };
  const [discoveryForm, setDiscoveryForm] = useState({
    enabled: discovery.enabled,
    intervalHours: discovery.intervalHours,
    minScore: discovery.minScore,
    maxCandidatesPerRun: discovery.maxCandidatesPerRun,
    sourceUrls: (discovery.sourceUrls || []).join("\n"),
    searchTerms: (discovery.searchTerms || []).join("\n")
  });

  useEffect(() => {
    setDiscoveryForm({
      enabled: discovery.enabled,
      intervalHours: discovery.intervalHours,
      minScore: discovery.minScore,
      maxCandidatesPerRun: discovery.maxCandidatesPerRun,
      sourceUrls: (discovery.sourceUrls || []).join("\n"),
      searchTerms: (discovery.searchTerms || []).join("\n")
    });
  }, [
    discovery.enabled,
    discovery.intervalHours,
    discovery.minScore,
    discovery.maxCandidatesPerRun,
    JSON.stringify(discovery.sourceUrls || []),
    JSON.stringify(discovery.searchTerms || [])
  ]);

  const saveDiscovery = () => action("discoverySave", () => api("/api/discovery/amazon/settings", {
    method: "PUT",
    body: {
      enabled: discoveryForm.enabled,
      intervalHours: discoveryForm.intervalHours,
      minScore: discoveryForm.minScore,
      maxCandidatesPerRun: discoveryForm.maxCandidatesPerRun,
      sourceUrls: lines(discoveryForm.sourceUrls),
      searchTerms: lines(discoveryForm.searchTerms)
    }
  }), "Descoberta Amazon atualizada");
  const runDiscovery = () => action("discoveryRun", () => api("/api/discovery/amazon/run", { method: "POST" }), "Descoberta Amazon executada");
  const configInputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none tdo-focus dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
  const configTextareaClass = "min-h-32 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none tdo-focus dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
  const healthTone = data.healthTone === "critical" ? "danger" : data.healthTone === "warning" ? "warning" : "success";
  const discoveryStatus = discoveryRunStatus(discovery.lastRun);

  return (
    <div className="space-y-5 md:space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricTile
          icon={Send}
          label="Telegram"
          value={telegramCount}
          tone={telegram?.ready ? "success" : "warning"}
          detail={telegramValue(telegram?.dryRun, "Dry-run ligado", "Envio real")}
        />
        <MetricTile
          icon={Search}
          label="Discovery"
          value={discovery.enabled ? "Ativa" : "Pausada"}
          tone={discovery.enabled ? "success" : "warning"}
          detail={discovery.nextRunAt ? `Proxima: ${formatDate(discovery.nextRunAt)}` : "Aguardando fontes"}
        />
        <MetricTile
          icon={CheckCircle2}
          label="Saude"
          value={`${data.healthScore}/100`}
          tone={healthTone}
          detail={`${data.alerts.length} sinais operacionais`}
        />
      </section>

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 space-y-5 xl:col-span-4">
          <Panel title="Automation" count={modeLabel(state.settings.mode)}>
            <FormField label="Modo de publicacao" help="Controla como a automacao publica oportunidades elegiveis.">
              <select
                value={state.settings.mode}
                onChange={(event) => action("mode", () => api("/api/settings", { method: "POST", body: { mode: event.target.value } }), "Modo atualizado")}
                className={configInputClass}
              >
                <option value="limited">Automatico limitado</option>
                <option value="manual">Manual</option>
                <option value="paused">Pausado</option>
              </select>
            </FormField>
          </Panel>

          <Panel title="Telegram" count={telegramCount}>
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <p>Dry-run: {telegramValue(telegram?.dryRun, "Ligado", "Desligado")}</p>
              <p>Bot token: {telegramValue(telegram?.hasBotToken, "Configurado", "Ausente")}</p>
              <p>Chat ID: {telegramValue(telegram?.hasChatId, "Configurado", "Ausente")}</p>
            </div>
            <ActionButton className="mt-4" variant="outline" loading={loading.telegramTest} onClick={() => action("telegramTest", () => api("/api/integrations/telegram/test", { method: "POST" }), "Teste Telegram executado")}>
              <Send className="size-4" /> Testar Telegram
            </ActionButton>
          </Panel>

          <Panel title="Affiliate Links" count={`${data.missingAffiliate} pendentes`}>
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">Recalcula URLs afiliadas usando as variaveis atuais do ambiente.</p>
            <ActionButton className="mt-4" loading={loading.refreshAffiliates} onClick={() => action("refreshAffiliates", () => api("/api/run/refresh-affiliates", { method: "POST" }), "Links recalculados")}>
              <RefreshCcw className="size-4" /> Recalcular
            </ActionButton>
          </Panel>

          <Panel title="Health" count={`${data.healthScore}/100`}>
            <div className="space-y-3">{data.alerts.map((alert) => <AlertItem key={alert.title} alert={alert} />)}</div>
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-8">
          <Panel title="Discovery Amazon" count={discovery.enabled ? "Ativa" : "Pausada"}>
            <div className="grid gap-4 xl:grid-cols-2">
              <FormField label="URLs Amazon" help="Uma URL por linha para fontes de descoberta monitoradas.">
                <textarea
                  className={configTextareaClass}
                  value={discoveryForm.sourceUrls}
                  onChange={(event) => setDiscoveryForm({ ...discoveryForm, sourceUrls: event.target.value })}
                  placeholder="https://www.amazon.com.br/s?k=ssd"
                />
              </FormField>
              <FormField label="Termos de busca" help="Um termo por linha para pesquisas automaticas.">
                <textarea
                  className={configTextareaClass}
                  value={discoveryForm.searchTerms}
                  onChange={(event) => setDiscoveryForm({ ...discoveryForm, searchTerms: event.target.value })}
                  placeholder={"SSD NVMe 1TB\nmonitor 144hz"}
                />
              </FormField>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <FormField label="Intervalo" help="Horas entre ciclos.">
                <input
                  className={configInputClass}
                  type="number"
                  value={discoveryForm.intervalHours}
                  onChange={(event) => setDiscoveryForm({ ...discoveryForm, intervalHours: event.target.value })}
                />
              </FormField>
              <FormField label="Score minimo" help="Corte para aceitar candidatos.">
                <input
                  className={configInputClass}
                  type="number"
                  value={discoveryForm.minScore}
                  onChange={(event) => setDiscoveryForm({ ...discoveryForm, minScore: event.target.value })}
                />
              </FormField>
              <FormField label="Maximo por ciclo" help="Limite por execucao.">
                <input
                  className={configInputClass}
                  type="number"
                  value={discoveryForm.maxCandidatesPerRun}
                  onChange={(event) => setDiscoveryForm({ ...discoveryForm, maxCandidatesPerRun: event.target.value })}
                />
              </FormField>
              <FormField label="Automatica" help="Permite execucao agendada.">
                <span className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={discoveryForm.enabled}
                    onChange={(event) => setDiscoveryForm({ ...discoveryForm, enabled: event.target.checked })}
                    className="size-4 rounded border-slate-300 text-tdo-blue tdo-focus dark:border-slate-600 dark:bg-slate-900"
                  />
                  Discovery habilitada
                </span>
              </FormField>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              <StatusLine label="Ultima execucao" value={discovery.lastRun?.finishedAt ? formatDate(discovery.lastRun.finishedAt) : "Nunca"} />
              <StatusLine label="Status" value={discoveryStatus.label} tone={discoveryStatus.tone} />
              <StatusLine label="Aceitos" value={String(discovery.lastRun?.acceptedCount ?? 0)} tone="success" />
              <StatusLine label="Erros" value={String(discovery.lastRun?.errorCount ?? 0)} tone={discovery.lastRun?.errorCount ? "danger" : "neutral"} />
              <StatusLine label="Proxima execucao" value={discovery.nextRunAt ? formatDate(discovery.nextRunAt) : "Aguardando fontes"} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <ActionButton loading={loading.discoverySave} onClick={saveDiscovery}>Salvar descoberta</ActionButton>
              <ActionButton variant="outline" loading={loading.discoveryRun} onClick={runDiscovery}>
                <Search className="size-4" /> Buscar agora
              </ActionButton>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function discoveryRunStatus(lastRun) {
  if (!lastRun) return { label: "Sem execucao", tone: "neutral" };
  if (lastRun.reason) return { label: discoveryReasonLabel(lastRun.reason), tone: lastRun.ok === false ? "danger" : "warning" };
  if (lastRun.ok === true) return { label: "Concluida", tone: "success" };
  if (lastRun.ok === false) return { label: "Falhou", tone: "danger" };
  return { label: "Sem execucao", tone: "neutral" };
}

function discoveryReasonLabel(reason) {
  return {
    no_sources_configured: "Sem fontes configuradas",
    not_due: "Ainda nao agendada",
    already_running: "Execucao em andamento"
  }[reason] || String(reason || "Sem execucao").replace(/_/g, " ");
}

function OfferTable({ offers, clicksByOffer, loading, api, action }) {
  const columns = [
    {
      key: "offer",
      label: "Oferta",
      cellClassName: "min-w-[360px]",
      render: (offer) => (
        <a href={offerOpenUrl(offer)} target="_blank" rel="noreferrer" className="flex items-start gap-3">
          <ProductThumb offer={offer} />
          <OfferIdentity offer={offer} clicks={clicksByOffer[offer.id] || 0} />
        </a>
      )
    },
    {
      key: "score",
      label: "Score",
      render: (offer) => <ScoreCell offer={offer} />
    },
    {
      key: "status",
      label: "Status",
      render: (offer) => <StatusBadge tone={statusBadgeTone(offer.status)}>{statusLabel(offer.status)}</StatusBadge>
    },
    {
      key: "affiliate",
      label: "Afiliado",
      cellClassName: "min-w-[300px]",
      render: (offer) => api && action
        ? <InlineAffiliateForm offer={offer} loading={loading} api={api} action={action} />
        : <StatusBadge tone={offer.affiliateReady ? "success" : "warning"}>{offer.affiliateReady ? "Pronto" : "Pendente"}</StatusBadge>
    },
    {
      key: "clicks",
      label: "Cliques",
      render: (offer) => (
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">{clicksByOffer[offer.id] || 0}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">rastreados</p>
        </div>
      )
    },
    {
      key: "actions",
      label: "Acoes",
      render: (offer) => (
        <a href={offerOpenUrl(offer)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
          <ExternalLink className="size-4 shrink-0" /> Abrir
        </a>
      )
    }
  ];

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        rows={offers}
        getKey={(offer) => offer.id}
        renderMobileCard={(offer) => (
          <OfferMobileCard offer={offer} clicks={clicksByOffer[offer.id] || 0} loading={loading} api={api} action={action} />
        )}
      />
      {!offers.length ? <EmptyState title="Nenhuma oferta" text="Execute a coleta para popular a tabela." /> : null}
    </div>
  );
}

function OfferIdentity({ offer, clicks }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap gap-2">
        {offer.source === "amazon_discovery" ? <StatusBadge tone="cyan">Descoberta Amazon</StatusBadge> : null}
        {offer.source === "amazon_discovery" && !offer.affiliateReady ? <StatusBadge tone="warning">Link oficial pendente</StatusBadge> : null}
      </div>
      <p className="line-clamp-2 max-w-[420px] text-sm font-medium text-slate-950 dark:text-slate-100">{offer.title}</p>
      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
        {storeLabel(offer.store)} - {offer.category || "Tech"} - {money(offer.currentPrice)} - {clicks} cliques
      </span>
      {offer.discoverySource ? (
        <span className="mt-1 block max-w-[420px] truncate text-xs text-slate-500 dark:text-slate-400">
          {offer.discoverySourceType === "term" ? "Termo" : "URL"}: {offer.discoverySource}
        </span>
      ) : null}
    </div>
  );
}

function ScoreCell({ offer }) {
  const score = Math.round(Number(offer.score || 0));
  const tone = score >= 85 ? "success" : score >= 70 ? "warning" : "muted";

  return (
    <div className="min-w-[86px]">
      <StatusBadge tone={tone}>{score}</StatusBadge>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{money(offer.currentPrice)}</p>
    </div>
  );
}

function OfferMobileCard({ offer, clicks, loading, api, action }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <a href={offerOpenUrl(offer)} target="_blank" rel="noreferrer" className="flex items-start gap-3">
        <ProductThumb offer={offer} />
        <OfferIdentity offer={offer} clicks={clicks} />
      </a>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatusLine label="Score" value={String(Math.round(Number(offer.score || 0)))} tone={offer.score >= 85 ? "success" : offer.score >= 70 ? "warning" : "neutral"} />
        <StatusLine label="Status" value={statusLabel(offer.status)} tone={statusBadgeTone(offer.status)} />
        <StatusLine label="Cliques" value={String(clicks)} />
      </div>
      <div className="mt-4">
        {api && action ? (
          <InlineAffiliateForm offer={offer} loading={loading} api={api} action={action} />
        ) : (
          <StatusBadge tone={offer.affiliateReady ? "success" : "warning"}>{offer.affiliateReady ? "Afiliado pronto" : "Afiliado pendente"}</StatusBadge>
        )}
      </div>
      <a href={offerOpenUrl(offer)} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800">
        <ExternalLink className="size-4 shrink-0" /> Abrir oferta
      </a>
    </article>
  );
}

function InlineAffiliateForm({ offer, loading, api, action }) {
  const [affiliateUrl, setAffiliateUrl] = useState(offer.affiliateSource === "manual" ? offer.affiliateUrl || "" : "");
  useEffect(() => setAffiliateUrl(offer.affiliateSource === "manual" ? offer.affiliateUrl || "" : ""), [offer.affiliateUrl, offer.affiliateSource]);
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <input
        aria-label={`Link afiliado oficial para ${offer.title}`}
        value={affiliateUrl}
        onChange={(event) => setAffiliateUrl(event.target.value)}
        placeholder="SiteStripe/amzn.to"
        className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-theme-xs text-gray-700 outline-hidden focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
      />
      <ActionButton
        className="w-full sm:w-auto"
        size="sm"
        variant={offer.affiliateSource === "manual" ? "outline" : "primary"}
        loading={loading?.[`affiliate-${offer.id}`]}
        disabled={!affiliateUrl.trim()}
        onClick={() => action(`affiliate-${offer.id}`, () => api(`/api/offers/${offer.id}/affiliate`, { method: "POST", body: { affiliateUrl } }), "Link afiliado salvo")}
      >
        Salvar
      </ActionButton>
    </div>
  );
}

function StatusLine({ label, value, tone = "neutral" }) {
  const toneClass = {
    brand: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300",
    muted: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-300",
    success: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300",
    warning: "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-300",
    danger: "border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300",
    neutral: "border-gray-200 text-gray-800 dark:border-gray-800 dark:text-white"
  }[tone] || "border-gray-200 text-gray-800 dark:border-gray-800 dark:text-white";

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-theme-xs opacity-75">{label}</p>
      <p className="mt-1 text-theme-sm font-medium">{value}</p>
    </div>
  );
}

function lines(value) {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function formatDate(value) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function Heatmap({ heatmap }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-[44px_repeat(24,minmax(0,1fr))] gap-1">
        <div />
        {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="text-center text-[10px] text-gray-400">{hour}</div>)}
        {heatmap.map((row, day) => (
          <React.Fragment key={day}>
            <div className="text-theme-xs text-gray-500 dark:text-gray-400">{dayLabels[day]}</div>
            {row.map((value, hour) => <div key={hour} className={`h-6 rounded-md border ${heatClass(intensity(value, heatmap.max))}`} title={`${value} atividades`} />)}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function Bars({ title, items }) {
  return (
    <div>
      <h4 className="mb-4 text-theme-sm font-medium text-gray-800 dark:text-white/90">{title}</h4>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between text-theme-xs text-gray-500 dark:text-gray-400">
              <span>{item.label}</span><span>{item.value}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
              <div className={`h-2 rounded-full ${barClass(item.tone)}`} style={{ width: `${item.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductThumb({ offer }) {
  const [image] = offerImages(offer);
  return (
    <div className="grid size-[50px] shrink-0 place-items-center overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
      {image ? <img src={image} alt="" className="size-[50px] object-contain p-1" loading="lazy" /> : <Box className="size-5 text-gray-400" />}
    </div>
  );
}

function AlertItem({ alert }) {
  return (
    <div className={`rounded-xl border p-4 ${alertClass(alert.tone)}`}>
      <div className="flex items-start gap-3">
        {alert.tone === "critical" ? <AlertTriangle className="mt-0.5 size-5" /> : <CheckCircle2 className="mt-0.5 size-5" />}
        <div>
          <p className="text-theme-sm font-semibold">{alert.title}</p>
          <p className="mt-1 text-theme-sm leading-5 opacity-80">{alert.text}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center dark:border-gray-800">
      <Package className="mx-auto mb-2 size-6 text-gray-400" />
      <p className="text-theme-sm font-medium text-gray-700 dark:text-gray-200">{title}</p>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">{text}</p>
    </div>
  );
}

function ToastStack({ toasts, setToasts }) {
  return (
    <div className="fixed bottom-5 right-5 z-99999 grid w-[min(380px,calc(100vw-40px))] gap-3">
      {toasts.map((item) => (
        <div key={item.id} className={`flex items-start justify-between gap-3 rounded-xl border bg-white p-4 shadow-theme-lg dark:bg-gray-900 ${item.tone === "error" ? "border-error-200 text-error-700 dark:border-error-500/30 dark:text-error-300" : "border-success-200 text-success-700 dark:border-success-500/30 dark:text-success-300"}`}>
          <div>
            <p className="text-theme-sm font-semibold">{item.title}</p>
            {item.detail ? <p className="mt-1 text-theme-sm opacity-80">{item.detail}</p> : null}
          </div>
          <button type="button" aria-label={`Fechar aviso: ${item.title}`} onClick={() => setToasts((items) => items.filter((toast) => toast.id !== item.id))}><X className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}

function buildDashboardData(state, selectedPeriod) {
  const since = periodStart(selectedPeriod);
  const inPeriod = (date) => !since || (date && new Date(date) >= since);
  const clicks = state.clicks.filter((click) => inPeriod(click.timestamp));
  const publishedDrafts = state.drafts.filter((draft) => draft.status === "published");
  const publishedDraftsInPeriod = publishedDrafts.filter((draft) => inPeriod(draft.publishedAt || draft.updatedAt || draft.createdAt));
  const pending = state.drafts.filter((draft) => ["needs_review", "auto_ready", "approved"].includes(draft.status)).length;
  const autoReady = state.offers.filter((offer) => offer.status === "auto_ready" && offer.affiliateReady).length;
  const reviewDrafts = state.drafts.filter((draft) => draft.status === "needs_review").length;
  const missingAffiliate = state.offers.filter((offer) => !offer.affiliateReady).length;
  const blocked = state.offers.filter((offer) => offer.validationStatus === "blocked" || offer.status === "blocked").length;
  const ready = state.offers.filter((offer) => offer.validationStatus === "ready" || offer.status === "auto_ready").length;
  const needsReviewOffers = state.offers.filter((offer) => offer.validationStatus === "needs_review").length;
  const failed = state.drafts.filter((draft) => ["failed", "blocked", "rejected"].includes(draft.status)).length;
  const clickRate = Math.round((clicks.length / Math.max(publishedDraftsInPeriod.length, 1)) * 100);
  const healthScore = clamp(74 + Math.min(autoReady * 3, 12) + Math.min(clicks.length, 12) - missingAffiliate * 2 - failed * 8 - reviewDrafts, 0, 100);
  const healthTone = healthScore >= 80 ? "green" : healthScore >= 55 ? "warning" : "critical";
  const heatmap = buildHeatmap([...clicks.map((item) => item.timestamp), ...publishedDrafts.map((item) => item.updatedAt || item.createdAt)].filter(Boolean).filter(inPeriod));
  const statusBars = buildBars(countBy(state.offers, (offer) => statusLabel(offer.status)), statusTone);
  const channelBars = buildBars({ ...countBy(state.offers, (offer) => storeLabel(offer.store)), ...countBy(state.drafts, (draft) => channelLabel(draft.channel)) }, channelTone);
  const categoryBars = buildBars(countBy(state.offers, (offer) => offer.category || "Tech"), categoryTone);
  const topOffers = [...state.offers].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 6);
  const alerts = [
    missingAffiliate ? { title: "Afiliado pendente", text: `${missingAffiliate} ofertas ainda nao estao prontas para monetizacao.`, tone: "critical" } : null,
    reviewDrafts ? { title: "Revisao humana", text: `${reviewDrafts} drafts aguardam aprovacao.`, tone: "warning" } : null,
    failed ? { title: "Falhas ou rejeicoes", text: `${failed} drafts precisam de correcao.`, tone: "critical" } : null,
    autoReady ? { title: "Pronto para escalar", text: `${autoReady} ofertas podem ser publicadas.`, tone: "success" } : null
  ].filter(Boolean);
  let rec = { title: "Pipeline estavel", text: "Nenhuma acao critica pendente agora.", action: { label: "Ver relatorios", view: "ai" } };
  if (missingAffiliate) rec = { title: "Afiliado pendente", text: `${missingAffiliate} ofertas nao estao prontas para monetizacao.`, action: { label: "Abrir configuracao", view: "config" } };
  else if (autoReady) rec = { title: "Ofertas prontas para envio", text: `${autoReady} ofertas passaram no score e podem ir para publicacao.`, action: { label: "Abrir operacao", view: "operation" } };
  else if (reviewDrafts) rec = { title: "Revisao necessaria", text: `${reviewDrafts} drafts aguardam decisao humana.`, action: { label: "Revisar fila", view: "operation" } };
  return { pending, autoReady, reviewDrafts, missingAffiliate, blocked, ready, needsReviewOffers, failed, clickRate, clicksInPeriod: clicks.length, publishedInPeriod: publishedDraftsInPeriod.length, healthScore, healthTone, heatmap, statusBars, channelBars, categoryBars, topOffers, alerts, rec, recommendations: state.recommendations || [] };
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
  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  return entries.map(([label, value]) => ({ label, value, percent: Math.round((value / total) * 100), tone: toneForLabel(label) }));
}

function countBy(items, fn) {
  return items.reduce((acc, item) => {
    const key = fn(item) || "Outros";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function draftColumn(draft) { return ["failed", "blocked", "rejected"].includes(draft.status) ? "problem" : draft.status; }
function draftActionsForStatus(status) {
  if (["auto_ready", "needs_review"].includes(status)) return ["approve", "edit", "regenerate", "clone", "reject"];
  if (status === "approved") return ["edit", "regenerate", "clone", "reject"];
  if (status === "published") return ["clone"];
  if (["rejected", "failed", "blocked"].includes(status)) return ["regenerate", "clone"];
  return [];
}
function statusLabel(status) { return { auto_ready: "Pronto", needs_review: "Revisao", approved: "Aprovado", published: "Publicado", archived: "Arquivado", rejected: "Rejeitado", failed: "Falhou", blocked: "Bloqueado" }[status] || status; }
function storeLabel(store) { return { amazon: "Amazon", mercado_livre: "Mercado Livre", telegram: "Telegram", x: "Twitter/X" }[store] || store || "Loja"; }
function channelLabel(channel) { return { telegram: "Telegram", x: "Twitter/X", admin: "Admin" }[channel] || channel || "Canal"; }
function modeLabel(mode) { return { limited: "Automatico limitado", manual: "Manual", paused: "Pausado" }[mode] || mode; }
function offerImages(offer) { return [...new Set([...(offer?.imageUrls || []), offer?.imageUrl].filter(Boolean))].slice(0, 4); }
function offerOpenUrl(offer) { return offer?.affiliateSource === "manual" && offer.affiliateUrl ? offer.affiliateUrl : `/go/offer/${offer.id}`; }
function statusTone(label) { return label === "Pronto" || label === "Publicado" ? "success" : label === "Revisao" ? "brand" : label === "Arquivado" ? "gray" : "critical"; }
function channelTone(label) { return label === "Amazon" ? "brand" : label === "Mercado Livre" ? "info" : label === "Telegram" ? "success" : "gray"; }
function categoryTone(label) { return label.length % 3 === 0 ? "brand" : label.length % 2 === 0 ? "info" : "success"; }
function intensity(count, max) { return max ? Math.ceil((count / max) * 5) : 0; }
function matches(value, query) { return !query || normalize(value).includes(normalize(query)); }
function normalize(value) { return String(value || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""); }
function money(value) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0)); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Math.round(value))); }
function statusBadgeTone(status) {
  return {
    auto_ready: "success",
    needs_review: "warning",
    approved: "brand",
    published: "success",
    archived: "muted",
    rejected: "danger",
    failed: "danger",
    blocked: "danger"
  }[status] || "muted";
}
function warningLabel(warning) {
  return {
    amazon_dynamic_price_review: "Amazon: revise preco/desconto antes de publicar, pois informacoes promocionais podem expirar."
  }[warning] || warning;
}
function barClass(tone) {
  return { success: "bg-success-500", brand: "bg-brand-500", info: "bg-blue-light-500", critical: "bg-error-500", gray: "bg-gray-400" }[tone] || "bg-brand-500";
}
function heatClass(level) {
  return [
    "border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800",
    "border-brand-200 bg-brand-100 dark:border-brand-500/20 dark:bg-brand-500/10",
    "border-brand-300 bg-brand-200 dark:border-brand-500/30 dark:bg-brand-500/20",
    "border-brand-400 bg-brand-300 dark:border-brand-500/40 dark:bg-brand-500/40",
    "border-brand-500 bg-brand-400 dark:border-brand-400 dark:bg-brand-500/70",
    "border-brand-600 bg-brand-500 dark:border-brand-300 dark:bg-brand-400"
  ][level] || "border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800";
}
function alertClass(tone) {
  return {
    critical: "border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300",
    warning: "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-300",
    success: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300"
  }[tone] || "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300";
}
