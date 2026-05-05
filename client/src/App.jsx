import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  ChevronDown,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Gauge,
  ImageIcon,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Menu,
  MousePointerClick,
  Package,
  RefreshCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  X,
  Zap
} from "lucide-react";

const views = [
  { id: "overview", label: "Visão Geral", icon: LayoutDashboard },
  { id: "operation", label: "Operação", icon: Megaphone },
  { id: "offers", label: "Ofertas", icon: ShoppingBag },
  { id: "ai", label: "IA / Relatórios", icon: Bot },
  { id: "config", label: "Configuração", icon: Settings }
];

const periods = [
  { id: "7", label: "7 dias", days: 7 },
  { id: "30", label: "30 dias", days: 30 },
  { id: "90", label: "90 dias", days: 90 },
  { id: "month", label: "Este mês", mode: "month" },
  { id: "year", label: "Este ano", mode: "year" }
];

const draftColumns = [
  ["auto_ready", "Pronto", "Pode publicar"],
  ["needs_review", "Revisão", "Aprovação humana"],
  ["approved", "Aprovado", "Liberado para envio"],
  ["published", "Publicado", "Histórico enviado"],
  ["problem", "Problema", "Falhou ou rejeitado"]
];

const dayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export default function App() {
  const [state, setState] = useState(null);
  const [view, setView] = useState("overview");
  const [period, setPeriod] = useState("30");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState({});
  const [toasts, setToasts] = useState([]);
  const [darkMode, setDarkMode] = useState(false);

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
      toast("Ação não concluída", error.message, "error");
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

  const selectedPeriod = periods.find((item) => item.id === period) || periods[1];
  const data = useMemo(() => state ? buildDashboardData(state, selectedPeriod) : null, [state, selectedPeriod]);
  const drafts = useMemo(() => state ? state.drafts.filter((draft) => {
    const offer = state.offers.find((item) => item.id === draft.offerId);
    return matches(`${draft.channel} ${draft.status} ${draft.text} ${offer?.title || ""}`, query);
  }) : [], [state, query]);
  const offers = useMemo(() => state ? state.offers.filter((offer) => matches(`${offer.store} ${offer.status} ${offer.title} ${offer.category}`, query)) : [], [state, query]);

  if (!state || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-200">
        <Loader2 className="mr-3 size-5 animate-spin text-brand-500" />
        Carregando TDO Links Admin...
      </div>
    );
  }

  const activeView = views.find((item) => item.id === view) || views[0];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="min-h-screen xl:pl-[290px]">
        <Sidebar view={view} setView={setView} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            activeView={activeView}
            darkMode={darkMode}
            period={period}
            query={query}
            setDarkMode={setDarkMode}
            setPeriod={setPeriod}
            setQuery={setQuery}
            setView={setView}
          />
          <main className="mx-auto w-full max-w-screen-2xl flex-1 overflow-y-auto p-4 md:p-6">
            <PageTitle activeView={activeView} />
            {view === "overview" && <Overview state={state} data={data} setView={setView} />}
            {view === "operation" && <Operation state={state} data={data} drafts={drafts} loading={loading} api={api} action={action} />}
            {view === "offers" && <Offers state={state} data={data} offers={offers} />}
            {view === "ai" && <Reports state={state} data={data} setView={setView} loading={loading} api={api} action={action} />}
            {view === "config" && <Config state={state} data={data} loading={loading} api={api} action={action} />}
          </main>
        </div>
      </div>
      <ToastStack toasts={toasts} setToasts={setToasts} />
    </div>
  );
}

function Sidebar({ view, setView }) {
  const mainItems = [
    { id: "overview", label: "Visão Geral", icon: LayoutDashboard, parent: "Dashboard" },
    { id: "operation", label: "Operação", icon: Megaphone, parent: "Operação" },
    { id: "offers", label: "Ofertas", icon: ShoppingBag, parent: "E-commerce" },
    { id: "ai", label: "IA / Relatórios", icon: Bot, parent: "Análise" },
    { id: "config", label: "Configuração", icon: Settings, parent: "Sistema" }
  ];
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[290px] shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white px-5 transition-all duration-300 dark:border-gray-800 dark:bg-black xl:flex">
      <div className="flex h-[88px] items-center">
        <button type="button" onClick={() => setView("overview")} className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-brand-500 text-sm font-black text-white shadow-theme-md">TDO</div>
          <div className="text-left">
            <p className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">TDO Links</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Affiliate Admin</p>
          </div>
        </button>
      </div>
      <div className="no-scrollbar flex flex-col overflow-y-auto duration-300">
        <nav className="mb-6">
          <h2 className="mb-4 text-xs uppercase leading-5 text-gray-400">Menu</h2>
          <div className="flex flex-col gap-1">
            <button type="button" className="menu-item menu-item-active justify-between">
              <span className="flex items-center gap-3">
                <LayoutDashboard className="size-5" />
                Dashboard
              </span>
              <ChevronDown className="size-4 text-gray-400" />
            </button>
            <div className="ml-9 mt-2 flex flex-col gap-1">
              {mainItems.slice(0, 1).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`menu-dropdown-item ${view === item.id ? "menu-dropdown-item-active" : "menu-dropdown-item-inactive"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {mainItems.slice(1).map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`menu-item ${active ? "menu-item-active" : "menu-item-inactive"}`}
                >
                  <Icon className="size-5" />
                  {item.parent}
                </button>
              );
            })}
          </div>
        </nav>
        <nav className="mb-6">
          <h2 className="mb-4 text-xs uppercase leading-5 text-gray-400">Others</h2>
          <div className="flex flex-col gap-1">
            {[
              ["Saúde do sistema", Gauge],
              ["Cliques rastreados", MousePointerClick],
              ["Relatórios", BarChart3]
            ].map(([label, Icon]) => (
              <button key={label} type="button" onClick={() => setView(label === "Relatórios" ? "ai" : "overview")} className="menu-item menu-item-inactive">
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>
        </nav>
        <div className="mb-6 rounded-2xl bg-gray-50 px-4 py-5 text-center dark:bg-white/[0.03]">
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">TDO Links Admin</h3>
          <p className="mb-4 text-xs leading-5 text-gray-500 dark:text-gray-400">Painel operacional para ofertas, publicação e cliques.</p>
          <button type="button" onClick={() => setView("operation")} className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-4 text-xs font-medium text-white transition hover:bg-brand-600">Abrir operação</button>
        </div>
      </div>
    </aside>
  );
}

function LegacySidebar({ view, setView }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[290px] shrink-0 border-r border-gray-200 bg-white px-5 py-6 dark:border-gray-800 dark:bg-[#111827] xl:block">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-xl bg-brand-500 text-sm font-black text-white shadow-theme-md">TDO</div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">TDO Links</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Centro de ofertas afiliadas</p>
        </div>
      </div>
      <nav className="space-y-2">
        {views.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-brand-50 text-brand-600 dark:bg-brand-500/[0.12] dark:text-brand-400"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
              }`}
            >
              <Icon className="size-5" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="absolute bottom-6 left-5 right-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <Zap className="size-4 text-brand-500" />
          Automação ativa
        </div>
        <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">Publicação limitada, aprovação humana e links rastreáveis.</p>
      </div>
    </aside>
  );
}

function Header({ darkMode, query, setDarkMode, setQuery, setView }) {
  return (
    <header className="sticky top-0 z-30 flex w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex grow flex-col items-center justify-between lg:flex-row lg:px-6">
        <div className="flex h-16 w-full items-center justify-between gap-2 border-b border-gray-200 px-3 dark:border-gray-800 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0">
          <button
            type="button"
            onClick={() => setView("overview")}
            className="flex size-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400 xl:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </button>
          <button type="button" onClick={() => setView("overview")} className="flex items-center gap-2 xl:hidden">
            <div className="grid size-8 place-items-center rounded-lg bg-brand-500 text-xs font-black text-white">TDO</div>
          </button>
          <label className="hidden h-11 w-full max-w-[430px] items-center gap-3 rounded-lg border border-gray-200 bg-transparent px-4 text-gray-500 dark:border-gray-800 dark:text-gray-400 lg:flex">
          <Search className="size-5" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
              placeholder="Search or type command..."
            className="h-full w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100"
          />
            <span className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-400 dark:border-gray-800">⌘ K</span>
        </label>
          <div className="flex items-center gap-2 lg:ml-auto">
            <button
              type="button"
              onClick={() => setDarkMode((value) => !value)}
              className="grid size-11 place-items-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
              aria-label="Alternar tema"
            >
              {darkMode ? <Zap className="size-5" /> : <Activity className="size-5" />}
            </button>
            <button
              type="button"
              className="relative grid size-11 place-items-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
              aria-label="Notificações"
            >
              <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-error-500" />
              <Bell className="size-5" />
            </button>
            <button type="button" className="flex items-center gap-3 rounded-full p-1.5 pr-2 transition hover:bg-gray-50 dark:hover:bg-white/[0.03]">
              <div className="grid size-10 place-items-center rounded-full bg-brand-500 text-sm font-semibold text-white">A</div>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Antonio</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Admin</p>
              </div>
              <ChevronDown className="hidden size-4 text-gray-400 sm:block" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function PageTitle({ activeView }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{activeView.id === "overview" ? "eCommerce" : activeView.label}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Home / {activeView.label}</p>
      </div>
    </div>
  );
}

function Overview({ state, data, setView }) {
  return (
    <div className="grid grid-cols-12 gap-4 pb-10 md:gap-6">
      <div className="col-span-12 space-y-6 xl:col-span-7">
        <EcommerceMetrics state={state} data={data} />
        <MonthlySales data={data} />
      </div>
      <div className="col-span-12 xl:col-span-5">
        <MonthlyTarget data={data} setView={setView} />
      </div>
      <div className="col-span-12 xl:col-span-8">
        <StatisticsPanel data={data} />
      </div>
      <div className="col-span-12 xl:col-span-4">
        <DemographicPanel data={data} />
      </div>
      <div className="col-span-12 xl:col-span-7">
        <Panel title="Recent Orders" count={`${data.topOffers.length} ofertas`}>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400 dark:border-gray-800">
                  <th className="px-4 py-3">Products</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.topOffers.map((offer) => (
                  <tr key={offer.id}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <ProductThumb offer={offer} />
                        <div>
                          <p className="tdo-line-clamp-2 max-w-[260px] text-sm font-medium text-gray-800 dark:text-white/90">{offer.title}</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{storeLabel(offer.store)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">{offer.category || "Tech"}</td>
                    <td className="px-4 py-4 font-mono text-sm text-gray-800 dark:text-white/90">{money(offer.currentPrice)}</td>
                    <td className="px-4 py-4"><Badge status={offer.status}>{statusLabel(offer.status)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      <div className="col-span-12 xl:col-span-5">
        <Panel title="Alertas operacionais" count={`${data.alerts.length} ativos`}>
          <AlertList alerts={data.alerts} />
        </Panel>
      </div>
    </div>
  );
}

function EcommerceMetrics({ state, data }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
      <article className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div className="flex size-12 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white/90">
          <ShoppingBag className="size-6" />
        </div>
        <div className="mt-5 flex items-end justify-between">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Ofertas</span>
            <h4 className="mt-2 font-mono text-2xl font-bold text-gray-800 dark:text-white/90">{state.metrics.offers}</h4>
          </div>
          <Badge status="auto_ready">{data.autoReady} prontas</Badge>
        </div>
      </article>
      <article className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div className="flex size-12 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white/90">
          <MousePointerClick className="size-6" />
        </div>
        <div className="mt-5 flex items-end justify-between">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Cliques</span>
            <h4 className="mt-2 font-mono text-2xl font-bold text-gray-800 dark:text-white/90">{state.metrics.clicks}</h4>
          </div>
          <Badge status="published">{data.clickRate}% / post</Badge>
        </div>
      </article>
    </div>
  );
}

function MonthlySales({ data }) {
  return (
    <Panel title="Monthly Sales" count={`${data.totalActivity} eventos`}>
      <Heatmap heatmap={data.heatmap} peak={data.peak} total={data.totalActivity} />
    </Panel>
  );
}

function MonthlyTarget({ data, setView }) {
  const percent = clamp(data.healthScore, 0, 100);
  return (
    <section className="h-full rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Monthly Target</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Meta de saúde e monetização do funil</p>
        </div>
        <button type="button" className="rounded-full p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]">•••</button>
      </div>
      <div className="mx-auto mt-8 grid size-52 place-items-center rounded-full border-[18px] border-gray-100 dark:border-gray-800">
        <div className="text-center">
          <strong className="font-mono text-4xl font-bold text-gray-800 dark:text-white/90">{percent}%</strong>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Saúde</p>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-[360px] text-center text-sm leading-6 text-gray-500 dark:text-gray-400">{data.rec[2]}</p>
      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-gray-100 pt-5 text-center dark:border-gray-800">
        <div><p className="text-xs text-gray-500">Pendentes</p><strong className="font-mono text-gray-800 dark:text-white">{data.pending}</strong></div>
        <div><p className="text-xs text-gray-500">Prontas</p><strong className="font-mono text-gray-800 dark:text-white">{data.autoReady}</strong></div>
        <div><p className="text-xs text-gray-500">Falhas</p><strong className="font-mono text-gray-800 dark:text-white">{data.failed}</strong></div>
      </div>
      <button type="button" onClick={() => setView(data.rec[3].view)} className="mt-6 h-11 w-full rounded-lg bg-brand-500 text-sm font-medium text-white transition hover:bg-brand-600">{data.rec[3].label}</button>
    </section>
  );
}

function StatisticsPanel({ data }) {
  return (
    <Panel title="Statistics" count="Overview">
      <div className="grid gap-6 md:grid-cols-3">
        <BarPanelInline title="Status" items={data.statusBars} />
        <BarPanelInline title="Lojas e canais" items={data.channelBars} />
        <BarPanelInline title="Categorias" items={data.categoryBars} />
      </div>
    </Panel>
  );
}

function BarPanelInline({ title, items }) {
  return (
    <div>
      <h4 className="mb-4 text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h4>
      <div className="space-y-4">
        {items.slice(0, 4).map((item) => (
          <div key={item.label}>
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{item.label}</span>
              <span>{item.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
              <div className={`h-2 rounded-full ${dotClass(item.tone)}`} style={{ width: `${Math.max(item.percent, 4)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemographicPanel({ data }) {
  return (
    <Panel title="Customers Demographic" count={`${data.channelBars.length} fontes`}>
      <div className="space-y-5">
        {data.channelBars.slice(0, 4).map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`size-3 rounded-full ${dotClass(item.tone)}`} />
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">{item.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.value} eventos</p>
              </div>
            </div>
            <span className="font-mono text-sm text-gray-500 dark:text-gray-400">{item.percent}%</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone }) {
  const toneClass = {
    warning: "bg-warning-50 text-warning-600 dark:bg-warning-500/10 dark:text-warning-400",
    success: "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400",
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400",
    info: "bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/10 dark:text-blue-light-400",
    critical: "bg-error-50 text-error-600 dark:bg-error-500/10 dark:text-error-400",
    green: "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400"
  }[tone] || "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm transition hover:-translate-y-0.5 hover:shadow-theme-md dark:border-gray-800 dark:bg-gray-900">
      <div className={`mb-5 grid size-11 place-items-center rounded-xl ${toneClass}`}>
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <strong className="font-mono text-3xl font-semibold text-gray-900 dark:text-white">{value}</strong>
        <span className="text-right text-xs text-gray-500 dark:text-gray-400">{detail}</span>
      </div>
    </article>
  );
}

function Panel({ title, count, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 ${className}`}>
      <header className="flex min-h-14 items-center justify-between border-b border-gray-100 px-5 dark:border-gray-800">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h2>
        {count ? <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{count}</span> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Heatmap({ heatmap, peak, total }) {
  return (
    <div className="space-y-5">
      <div className="overflow-x-auto pb-2">
        <div className="min-w-[620px]">
          <div className="ml-12 grid grid-cols-24 gap-1">
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} className="text-center font-mono text-[10px] text-gray-400">{hour % 4 === 0 ? String(hour).padStart(2, "0") : ""}</span>
            ))}
          </div>
          <div className="mt-2 grid gap-1">
            {dayLabels.map((day, dayIndex) => (
              <div key={day} className="grid grid-cols-[40px_1fr] items-center gap-2">
                <span className="text-right text-xs text-gray-500 dark:text-gray-400">{day}</span>
                <div className="grid grid-cols-24 gap-1">
                  {heatmap[dayIndex].map((count, hour) => (
                    <span
                      key={`${day}-${hour}`}
                      className={`size-4 rounded border ${heatClass(intensity(count, heatmap.max))}`}
                      title={`${day} ${String(hour).padStart(2, "0")}h: ${count} eventos`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/10">
            <Zap className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{total ? `Pico: ${peak.label}` : "Sem atividade suficiente"}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{total ? "Use os horários fortes para testar novas ofertas." : "Os primeiros cliques irão preencher este mapa."}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <span>menos</span>
          {[0, 1, 2, 3, 4, 5].map((level) => <span key={level} className={`size-3 rounded ${heatClass(level)}`} />)}
          <span>mais</span>
        </div>
      </div>
    </div>
  );
}

function BarPanel({ title, count, items }) {
  return (
    <Panel title={title} count={count}>
      <div className="space-y-5">
        {items.length ? items.map((item) => (
          <div key={item.label}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-200">
                <span className={`size-2 rounded-full ${dotClass(item.tone)}`} />
                {item.label}
              </div>
              <div className="font-mono text-xs text-gray-500 dark:text-gray-400">{item.value} · {item.percent}%</div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div className={`h-full rounded-full ${dotClass(item.tone)}`} style={{ width: `${Math.max(item.percent, 3)}%` }} />
            </div>
          </div>
        )) : <EmptyState title="Sem dados ainda" text="O sistema irá preencher este painel após novas coletas." />}
      </div>
    </Panel>
  );
}

function InsightCard({ data, setView }) {
  const [tone, title, text, next] = data.rec;
  const classes = {
    critico: "border-error-200 bg-error-50 dark:border-error-500/20 dark:bg-error-500/10",
    atencao: "border-warning-200 bg-warning-50 dark:border-warning-500/20 dark:bg-warning-500/10",
    pronto: "border-success-200 bg-success-50 dark:border-success-500/20 dark:bg-success-500/10",
    estavel: "border-brand-200 bg-brand-50 dark:border-brand-500/20 dark:bg-brand-500/10"
  }[tone];

  return (
    <section className={`rounded-2xl border p-6 shadow-theme-sm ${classes}`}>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-brand-600 dark:text-brand-300">
          <Sparkles className="size-5" />
          <span className="text-sm font-semibold">Próxima ação recomendada</span>
        </div>
        <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">IA operacional</span>
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">{text}</p>
      <button
        type="button"
        onClick={() => setView(next.view)}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-gray-900 px-5 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-black active:translate-y-0 dark:bg-white dark:text-gray-900"
      >
        {next.label}
      </button>
    </section>
  );
}

function Operation({ state, data, drafts, loading, api, action }) {
  return (
    <div className="space-y-6 pb-10">
      <ActionPanel data={data} loading={loading} api={api} action={action} />
      <section className="grid gap-5 xl:grid-cols-5">
        {draftColumns.map(([id, title, help]) => {
          const items = drafts.filter((draft) => draftColumn(draft) === id);
          return (
            <Panel key={id} title={title} count={`${items.length}`} className="min-h-[460px]">
              <p className="-mt-2 mb-4 text-sm text-gray-500 dark:text-gray-400">{help}</p>
              <div className="space-y-4">
                {items.length ? items.map((draft) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    offer={resolveDraftOffer(draft, state.offers)}
                    fallbackOffers={state.offers}
                    loading={loading}
                    api={api}
                    action={action}
                  />
                )) : <EmptyState title="Sem itens" text="Nada nesta etapa agora." />}
              </div>
            </Panel>
          );
        })}
      </section>
    </div>
  );
}

function ActionPanel({ data, loading, api, action }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">Controle operacional</p>
          <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{data.rec[1]}</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button loading={loading.scrape} onClick={() => action("scrape", () => api("/api/run/scrape", { method: "POST" }), "Busca de ofertas concluída")}><RefreshCcw className="size-4" /> Buscar ofertas</Button>
          <Button loading={loading.publish} onClick={() => action("publish", () => api("/api/run/publish", { method: "POST" }), "Publicação processada")}><Send className="size-4" /> Publicar elegíveis</Button>
          <Button variant="outline" loading={loading.report} onClick={() => action("report", () => api("/api/run/report", { method: "POST" }), "Relatório gerado")}><BarChart3 className="size-4" /> Gerar relatório</Button>
        </div>
      </div>
    </section>
  );
}

function DraftCard({ draft, offer, fallbackOffers, loading, api, action }) {
  const [text, setText] = useState(draft.text);
  const [editing, setEditing] = useState(false);
  useEffect(() => setText(draft.text), [draft.text]);

  const actions = draftActionsForStatus(draft.status);
  const key = (name) => `${name}:${draft.id}`;
  const canEdit = actions.includes("edit");

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs transition hover:-translate-y-0.5 hover:shadow-theme-sm dark:border-gray-800 dark:bg-gray-950/40">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Badge status={draft.status}>{statusLabel(draft.status)}</Badge>
        <span className="font-mono text-xs text-gray-400">{channelLabel(draft.channel)}</span>
      </div>
      <h3 className="mb-4 text-sm font-semibold leading-5 text-gray-900 dark:text-white">{offer?.title || inferTitle(text) || "Post de aquisição"}</h3>
      <PostPreview draft={draft} offer={offer} fallbackOffers={fallbackOffers} text={text} />
      {canEdit ? (
        <button type="button" onClick={() => setEditing((value) => !value)} className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
          {editing ? "Fechar edição" : "Editar texto"}
        </button>
      ) : null}
      {editing ? <DraftTextEditor value={text} onChange={setText} /> : null}
      {draft.rejectionReason ? <p className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">Motivo: {draft.rejectionReason}</p> : null}
      {actions.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {actions.includes("approve") && <Button size="sm" loading={loading[key("approve")]} onClick={() => action(key("approve"), () => api(`/api/drafts/${draft.id}/approve`, { method: "POST" }), "Draft aprovado")}><Check className="size-4" /> Aprovar</Button>}
          {actions.includes("edit") && <Button size="sm" variant="outline" loading={loading[key("edit")]} onClick={() => action(key("edit"), () => api(`/api/drafts/${draft.id}/edit`, { method: "POST", body: { text } }), "Edição salva")}>Salvar edição</Button>}
          {actions.includes("regenerate") && <Button size="sm" variant="outline" loading={loading[key("regen")]} onClick={() => action(key("regen"), () => api(`/api/drafts/${draft.id}/regenerate`, { method: "POST" }), "Texto regenerado")}><RefreshCcw className="size-4" /> Regenerar</Button>}
          {actions.includes("clone") && <Button size="sm" variant="outline" loading={loading[key("clone")]} onClick={() => action(key("clone"), () => api(`/api/drafts/${draft.id}/clone`, { method: "POST" }), "Teste duplicado")}><Copy className="size-4" /> Duplicar teste</Button>}
          {actions.includes("reject") && <Button size="sm" variant="danger" loading={loading[key("reject")]} onClick={() => action(key("reject"), () => api(`/api/drafts/${draft.id}/reject`, { method: "POST", body: { reason: "Rejeitado no dashboard." } }), "Draft rejeitado")}>Rejeitar</Button>}
        </div>
      ) : null}
    </article>
  );
}

function PostPreview({ draft, offer, fallbackOffers, text }) {
  const images = previewImages(offer, fallbackOffers, text);
  const channel = draft.channel;
  const postText = formatPostText(offer, draft, channel, text);
  const isX = channel === "x";

  return (
    <section className={`overflow-hidden rounded-xl border ${isX ? "border-gray-900 bg-black text-white" : "border-brand-500/20 bg-[#132235] text-white"}`}>
      <div className="flex items-center justify-between px-3 py-2">
        <strong className="text-sm">{isX ? "X / Twitter" : "Telegram"}</strong>
        <span className="font-mono text-[10px] uppercase tracking-wider text-white/50">Preview do post</span>
      </div>
      {isX ? (
        <div className="space-y-4 px-3 pb-3">
          <p className="post-copy text-[13px] leading-5">{postText}</p>
          <ImageMosaic images={images} title={offer?.title || inferTitle(text)} />
        </div>
      ) : (
        <div>
          <ImageMosaic images={images} title={offer?.title || inferTitle(text)} />
          <p className="post-copy px-3 py-4 text-[13px] leading-5">{postText}</p>
        </div>
      )}
    </section>
  );
}

function ImageMosaic({ images, title }) {
  const safeImages = images.slice(0, 4);
  if (!safeImages.length) {
    return (
      <div className="grid min-h-[180px] place-items-center bg-gray-100 text-gray-500">
        <div className="text-center">
          <ImageIcon className="mx-auto mb-2 size-8" />
          <p className="max-w-[220px] text-xs leading-5">{title || "Produto sem imagem disponível"}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={`post-mosaic post-mosaic-${safeImages.length}`}>
      {safeImages.map((image, index) => (
        <div key={`${image}-${index}`} className="post-image-cell">
          <img src={image} alt="" loading="lazy" />
        </div>
      ))}
    </div>
  );
}

function DraftTextEditor({ value, onChange }) {
  const ref = React.useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={1}
      className="mt-3 min-h-32 w-full resize-none overflow-hidden rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm leading-6 text-gray-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
    />
  );
}

function Offers({ state, data, offers }) {
  return (
    <div className="space-y-6 pb-10">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={ShieldCheck} label="Prontas" value={data.autoReady} detail="score alto" tone="success" />
        <MetricCard icon={AlertTriangle} label="Sem afiliado" value={data.missingAffiliate} detail="corrigir antes de escalar" tone="critical" />
        <MetricCard icon={Store} label="Lojas" value={data.storeCount} detail="fontes rastreadas" tone="brand" />
      </section>
      <Panel title="Radar de ofertas" count={`${offers.length} visíveis`}>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400 dark:border-gray-800">
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Loja</th>
                <th className="px-4 py-3">Preço</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Afiliado</th>
                <th className="px-4 py-3">Cliques</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {offers.map((offer) => (
                <tr key={offer.id} className="transition hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <ProductThumb offer={offer} />
                      <div>
                        <p className="tdo-line-clamp-2 max-w-[420px] text-sm font-medium leading-5 text-gray-900 dark:text-white">{offer.title}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{offer.category || "tech"} · {offer.discountPercent || 0}% off</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{storeLabel(offer.store)}</td>
                  <td className="px-4 py-4">
                    <p className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{money(offer.currentPrice)}</p>
                    {offer.previousPrice ? <p className="text-xs text-gray-400 line-through">{money(offer.previousPrice)}</p> : null}
                  </td>
                  <td className="px-4 py-4"><Badge status={offer.status}>Score {offer.score}</Badge></td>
                  <td className="px-4 py-4">{offer.affiliateReady ? <Badge status="published">Configurado</Badge> : <Badge status="failed">Pendente</Badge>}</td>
                  <td className="px-4 py-4 font-mono text-sm text-gray-600 dark:text-gray-300">{state.metrics.clicksByOffer?.[offer.id] || 0}</td>
                  <td className="px-4 py-4 text-right">
                    <a href={`/go/offer/${offer.id}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 transition hover:-translate-y-0.5 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800">
                      Abrir <ExternalLink className="size-4" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!offers.length ? <EmptyState title="Nenhuma oferta encontrada" text="Ajuste a busca ou rode uma nova coleta." /> : null}
        </div>
      </Panel>
    </div>
  );
}

function Reports({ state, data, setView, loading, api, action }) {
  return (
    <div className="grid gap-6 pb-10 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-6">
        <InsightCard data={data} setView={setView} />
        <Panel title="Gerar análise" count="IA">
          <p className="mb-4 text-sm leading-6 text-gray-500 dark:text-gray-400">Cria uma leitura dos cliques, horários, categorias e gargalos do funil.</p>
          <Button loading={loading.report} onClick={() => action("report", () => api("/api/run/report", { method: "POST" }), "Relatório gerado")}><BarChart3 className="size-4" /> Gerar relatório</Button>
        </Panel>
      </div>
      <Panel title="Histórico de análises" count={`${state.reports.length} total`}>
        <div className="space-y-4">
          {state.reports.length ? state.reports.map((report) => (
            <article key={report.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{report.period}</span>
              <h3 className="mt-2 text-base font-semibold text-gray-900 dark:text-white">{report.expectedImpact}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{report.conclusions.join(" ")}</p>
              <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">{report.suggestions.join(" ")}</p>
            </article>
          )) : <EmptyState title="Nenhum relatório gerado" text="Gere um relatório para criar recomendações." />}
        </div>
      </Panel>
    </div>
  );
}

function Config({ state, data, loading, api, action }) {
  return (
    <div className="grid gap-6 pb-10 xl:grid-cols-3">
      <Panel title="Automação" count={modeLabel(state.settings.mode)}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Modo de publicação</label>
        <select
          value={state.settings.mode}
          onChange={(event) => action("mode", () => api("/api/settings", { method: "POST", body: { mode: event.target.value } }), "Modo atualizado")}
          className="mt-3 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
        >
          <option value="limited">Automático limitado</option>
          <option value="manual">Manual</option>
          <option value="paused">Pausado</option>
        </select>
      </Panel>
      <Panel title="Links afiliados" count={`${data.missingAffiliate} pendentes`}>
        <p className="mb-4 text-sm leading-6 text-gray-500 dark:text-gray-400">Recalcula URLs afiliadas salvas usando as variáveis atuais do Railway.</p>
        <Button loading={loading.refreshAffiliates} onClick={() => action("refreshAffiliates", () => api("/api/run/refresh-affiliates", { method: "POST" }), "Links afiliados recalculados")}>Recalcular afiliados</Button>
      </Panel>
      <Panel title="Saúde" count={`${data.healthScore}/100`}>
        <AlertList alerts={data.alerts} />
      </Panel>
    </div>
  );
}

function OfferRow({ offer, clicks }) {
  return (
    <a href={`/go/offer/${offer.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-4 px-1 py-4 transition hover:translate-x-1">
      <ProductThumb offer={offer} />
      <div className="min-w-0 flex-1">
        <p className="tdo-line-clamp-2 text-sm font-medium leading-5 text-gray-900 dark:text-white">{offer.title}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{storeLabel(offer.store)} · {money(offer.currentPrice)} · {clicks} cliques</p>
      </div>
      <ExternalLink className="size-4 text-gray-400" />
    </a>
  );
}

function ProductThumb({ offer }) {
  const [image] = offerImages(offer);
  return (
    <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
      {image ? <img src={image} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : <Package className="size-5 text-gray-400" />}
    </div>
  );
}

function AlertList({ alerts }) {
  return (
    <div className="space-y-3">
      {alerts.length ? alerts.map((alert) => (
        <div key={alert.title} className={`rounded-xl border p-4 ${alertClass(alert.tone)}`}>
          <div className="flex items-start gap-3">
            {alert.tone === "critical" ? <AlertTriangle className="mt-0.5 size-5" /> : <Check className="mt-0.5 size-5" />}
            <div>
              <p className="text-sm font-semibold">{alert.title}</p>
              <p className="mt-1 text-sm leading-5 opacity-80">{alert.text}</p>
            </div>
          </div>
        </div>
      )) : (
        <div className="rounded-xl border border-success-200 bg-success-50 p-4 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">
          <p className="text-sm font-semibold">Pipeline estável</p>
          <p className="mt-1 text-sm opacity-80">Nenhum alerta operacional agora.</p>
        </div>
      )}
    </div>
  );
}

function Button({ children, loading, variant = "primary", size = "md", className = "", ...props }) {
  const variantClass = {
    primary: "bg-brand-500 text-white hover:bg-brand-600 disabled:bg-brand-400",
    outline: "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800",
    danger: "border border-error-200 bg-error-50 text-error-600 hover:bg-error-100 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
  }[variant];
  const sizeClass = size === "sm" ? "h-9 px-3 text-xs" : "h-11 px-4 text-sm";
  return (
    <button
      type="button"
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium shadow-theme-xs transition hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70 ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

function Badge({ status, children }) {
  const statusClass = {
    auto_ready: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300",
    needs_review: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300",
    approved: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
    published: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300",
    archived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    rejected: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-300",
    failed: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-300",
    blocked: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-300"
  }[status] || "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}`}>{children}</span>;
}

function EmptyState({ title, text }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center dark:border-gray-800">
      <Package className="mx-auto mb-2 size-6 text-gray-400" />
      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{title}</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{text}</p>
    </div>
  );
}

function ToastStack({ toasts, setToasts }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 grid w-[min(380px,calc(100vw-40px))] gap-3">
      {toasts.map((item) => (
        <div key={item.id} className={`flex items-start justify-between gap-3 rounded-xl border bg-white p-4 shadow-theme-lg dark:bg-gray-900 ${item.tone === "error" ? "border-error-200 text-error-700 dark:border-error-500/30 dark:text-error-300" : "border-success-200 text-success-700 dark:border-success-500/30 dark:text-success-300"}`}>
          <div>
            <p className="text-sm font-semibold">{item.title}</p>
            {item.detail ? <p className="mt-1 text-sm opacity-80">{item.detail}</p> : null}
          </div>
          <button type="button" onClick={() => setToasts((items) => items.filter((toast) => toast.id !== item.id))}><X className="size-4" /></button>
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
  const pending = state.drafts.filter((draft) => ["needs_review", "auto_ready", "approved"].includes(draft.status)).length;
  const autoReady = state.offers.filter((offer) => offer.status === "auto_ready" && offer.affiliateReady).length;
  const reviewDrafts = state.drafts.filter((draft) => draft.status === "needs_review").length;
  const missingAffiliate = state.offers.filter((offer) => !offer.affiliateReady).length;
  const failed = state.drafts.filter((draft) => ["failed", "blocked", "rejected"].includes(draft.status)).length;
  const clickRate = Math.round((clicks.length / Math.max(publishedDrafts.length, 1)) * 100);
  const healthScore = clamp(74 + Math.min(autoReady * 3, 12) + Math.min(clicks.length, 12) - missingAffiliate * 2 - failed * 8 - reviewDrafts, 0, 100);
  const healthTone = healthScore >= 80 ? "green" : healthScore >= 55 ? "warning" : "critical";
  const heatmap = buildHeatmap([...clicks.map((item) => item.timestamp), ...publishedDrafts.map((item) => item.updatedAt || item.createdAt)].filter(Boolean).filter(inPeriod));
  const statusBars = buildBars(countBy(state.offers, (offer) => statusLabel(offer.status)), statusTone);
  const channelBars = buildBars({
    ...countBy(state.offers, (offer) => storeLabel(offer.store)),
    ...countBy(state.drafts, (draft) => channelLabel(draft.channel))
  }, channelTone);
  const categoryBars = buildBars(countBy(state.offers, (offer) => offer.category || "Tech"), categoryTone);
  const topOffers = [...state.offers].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 6);
  const storeCount = new Set(state.offers.map((offer) => offer.store).filter(Boolean)).size;
  const alerts = [
    missingAffiliate ? { title: "Afiliado pendente", text: `${missingAffiliate} ofertas ainda não estão prontas para monetização.`, tone: "critical" } : null,
    reviewDrafts ? { title: "Revisão humana", text: `${reviewDrafts} drafts aguardam aprovação.`, tone: "warning" } : null,
    failed ? { title: "Falhas ou rejeições", text: `${failed} drafts precisam de correção.`, tone: "critical" } : null,
    autoReady ? { title: "Pronto para escalar", text: `${autoReady} ofertas podem ser publicadas.`, tone: "success" } : null
  ].filter(Boolean);
  let rec = ["estavel", "Pipeline estável", "Nenhuma ação crítica pendente agora.", { label: "Ver relatórios", view: "ai" }];
  if (missingAffiliate) rec = ["critico", "Afiliado pendente", `${missingAffiliate} ofertas não estão prontas para monetização.`, { label: "Abrir configuração", view: "config" }];
  else if (autoReady) rec = ["pronto", "Ofertas prontas para envio", `${autoReady} ofertas passaram no score e podem ir para publicação.`, { label: "Abrir operação", view: "operation" }];
  else if (reviewDrafts) rec = ["atencao", "Revisão necessária", `${reviewDrafts} drafts aguardam decisão humana.`, { label: "Revisar fila", view: "operation" }];
  return { pending, autoReady, reviewDrafts, missingAffiliate, failed, clickRate, healthScore, healthTone, heatmap, peak: heatmap.peak, totalActivity: heatmap.total, statusBars, channelBars, categoryBars, topOffers, storeCount, alerts, rec };
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
  let max = 0;
  let peak = { day: 0, hour: 0, value: 0, label: "sem pico" };
  grid.forEach((row, day) => row.forEach((value, hour) => {
    if (value > max) {
      max = value;
      peak = { day, hour, value, label: `${dayNames[(day + 1) % 7]} às ${hour}h` };
    }
  }));
  grid.max = max;
  grid.peak = peak;
  grid.total = timestamps.length;
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
function statusLabel(status) { return { auto_ready: "Pronto", needs_review: "Revisão", approved: "Aprovado", published: "Publicado", archived: "Arquivado", rejected: "Rejeitado", failed: "Falhou", blocked: "Bloqueado" }[status] || status; }
function storeLabel(store) { return { amazon: "Amazon", mercado_livre: "Mercado Livre", telegram: "Telegram", x: "Twitter/X" }[store] || store || "Loja"; }
function channelLabel(channel) { return { telegram: "Telegram", x: "Twitter/X", admin: "Admin" }[channel] || channel || "Canal"; }
function modeLabel(mode) { return { limited: "Automático limitado", manual: "Manual", paused: "Pausado" }[mode] || mode; }
function offerImages(offer) { return [...new Set([...(offer?.imageUrls || []), offer?.imageUrl].filter(Boolean))].slice(0, 4); }
function previewImages(offer, fallbackOffers, text) {
  const direct = offerImages(offer);
  if (direct.length) return direct;
  const inferred = resolveDraftOffer({ text }, fallbackOffers);
  const inferredImages = offerImages(inferred);
  if (inferredImages.length) return inferredImages;
  const sameCategory = fallbackOffers.find((item) => item.category === offer?.category && offerImages(item).length);
  return offerImages(sameCategory);
}
function resolveDraftOffer(draft, offers) {
  if (draft.offerId) {
    const direct = offers.find((offer) => offer.id === draft.offerId);
    if (direct) return direct;
  }
  const normalizedText = normalize(draft.text || "");
  return offers.find((offer) => {
    const words = normalize(offer.title).split(/\s+/).filter((word) => word.length >= 4).slice(0, 5);
    return words.length >= 2 && words.filter((word) => normalizedText.includes(word)).length >= 2;
  }) || null;
}
function inferTitle(text) {
  return String(text || "").split("\n").find((line) => line && !line.includes("Promoção") && !line.includes("OFF") && !line.startsWith("Ad ") && !line.startsWith("Agora,")) || "";
}
function formatPostText(offer, draft, channel, fallbackText) {
  if (!offer) return fallbackText || "";
  const url = draft.shortCode
    ? `${window.location.origin}/go/${draft.shortCode}`
    : `${window.location.origin}/go/offer/${offer.id}`;
  const previous = offer.previousPrice ? money(offer.previousPrice) : "preço normal";
  const saving = offer.previousPrice && offer.previousPrice > offer.currentPrice
    ? money(offer.previousPrice - offer.currentPrice)
    : offer.discountPercent ? `${offer.discountPercent}%` : "oferta";
  const category = previewCategory(offer);
  const title = cleanTitle(offer.title);
  const base = [
    "🚨 Super Promoção:",
    `🫧 ${category} com ${saving} OFF.`,
    "",
    title,
    `De ${previous} | Por ${money(offer.currentPrice)}`
  ].join("\n");
  if (channel === "x") return `${base}\n\nAd ${storeLabel(offer.store)}: ${url}`;
  return `${base}\n\nAgora, na ${storeLabel(offer.store)}:\n${url}\n-\nLink de afiliado: posso receber comissão pela compra.`;
}
function cleanTitle(title) {
  return String(title || "").replace(/\s+/g, " ").trim();
}
function previewCategory(offer) {
  const title = normalize(offer.title);
  if (title.includes("ssd")) return "SSD";
  if (title.includes("mouse")) return "Mouse";
  if (title.includes("hub")) return "Hub USB-C";
  if (title.includes("air max") || title.includes("tenis") || title.includes("tn")) return "TN";
  return offer.category && offer.category !== "tech" ? offer.category : "Produto";
}
function statusTone(label) { return label === "Pronto" || label === "Publicado" ? "success" : label === "Revisão" ? "brand" : label === "Arquivado" ? "gray" : "critical"; }
function channelTone(label) { return label === "Amazon" ? "brand" : label === "Mercado Livre" ? "info" : label === "Telegram" ? "success" : "gray"; }
function categoryTone(label) { return label.length % 3 === 0 ? "brand" : label.length % 2 === 0 ? "info" : "success"; }
function intensity(count, max) { return max ? Math.ceil((count / max) * 5) : 0; }
function matches(value, query) { return !query || normalize(value).includes(normalize(query)); }
function normalize(value) { return String(value || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""); }
function money(value) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0)); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Math.round(value))); }
function dotClass(tone) {
  return {
    success: "bg-success-500",
    brand: "bg-brand-500",
    info: "bg-blue-light-500",
    critical: "bg-error-500",
    warning: "bg-warning-500",
    gray: "bg-gray-400"
  }[tone] || "bg-brand-500";
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
