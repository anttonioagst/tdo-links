import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  Box,
  ChevronDown,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Gauge,
  Grid3X3,
  LayoutDashboard,
  Loader2,
  Menu,
  Moon,
  MousePointerClick,
  Package,
  RefreshCcw,
  Search,
  Send,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Sun,
  X,
  Zap
} from "lucide-react";

const navItems = [
  {
    name: "Dashboard",
    icon: LayoutDashboard,
    subItems: [{ name: "Ecommerce", view: "overview" }]
  },
  { name: "Operacao", icon: Send, view: "operation" },
  { name: "Ofertas", icon: ShoppingBag, view: "offers" },
  { name: "IA / Relatorios", icon: Bot, view: "ai" },
  { name: "Configuracao", icon: Settings, view: "config" }
];

const othersItems = [
  { name: "Cliques", icon: MousePointerClick, view: "overview" },
  { name: "Score", icon: Gauge, view: "offers" },
  { name: "Publicacao", icon: Zap, view: "operation" }
];

const viewTitles = {
  overview: "eCommerce",
  operation: "Operacao",
  offers: "Ofertas",
  ai: "IA / Relatorios",
  config: "Configuracao"
};

const periods = [
  { id: "7", label: "7 dias", days: 7 },
  { id: "30", label: "30 dias", days: 30 },
  { id: "90", label: "90 dias", days: 90 },
  { id: "month", label: "Este mes", mode: "month" },
  { id: "year", label: "Este ano", mode: "year" }
];

const draftColumns = [
  ["auto_ready", "Pronto"],
  ["needs_review", "Revisao"],
  ["approved", "Aprovado"],
  ["published", "Publicado"],
  ["problem", "Problema"]
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
  const [isExpanded, setIsExpanded] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
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

  const sidebarWide = isExpanded || isHovered || isMobileOpen;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white/90">
      <Sidebar
        isExpanded={isExpanded}
        isHovered={isHovered}
        isMobileOpen={isMobileOpen}
        setIsHovered={setIsHovered}
        setIsMobileOpen={setIsMobileOpen}
        setView={setView}
        sidebarWide={sidebarWide}
        view={view}
      />
      {isMobileOpen ? <button className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden" onClick={() => setIsMobileOpen(false)} aria-label="Fechar menu" /> : null}
      <div className={`flex-1 transition-all duration-300 ease-in-out ${sidebarWide ? "lg:ml-[290px]" : "lg:ml-[90px]"}`}>
        <Header
          appMenuOpen={appMenuOpen}
          darkMode={darkMode}
          inputRef={inputRef}
          query={query}
          setAppMenuOpen={setAppMenuOpen}
          setDarkMode={setDarkMode}
          setIsExpanded={setIsExpanded}
          setIsMobileOpen={setIsMobileOpen}
          setQuery={setQuery}
          state={state}
        />
        <main className="mx-auto max-w-(--breakpoint-2xl) p-4 md:p-6">
          <PageTitle view={view} />
          {view === "overview" && <Overview state={state} data={data} setPeriod={setPeriod} period={period} setView={setView} />}
            {view === "operation" && <Operation state={state} data={data} drafts={drafts} loading={loading} api={api} action={action} />}
            {view === "offers" && <Offers state={state} data={data} offers={offers} loading={loading} api={api} action={action} />}
          {view === "ai" && <Reports state={state} data={data} loading={loading} api={api} action={action} />}
          {view === "config" && <Config state={state} data={data} loading={loading} api={api} action={action} />}
        </main>
      </div>
      <ToastStack toasts={toasts} setToasts={setToasts} />
    </div>
  );
}

function Sidebar({ isExpanded, isHovered, isMobileOpen, setIsHovered, setIsMobileOpen, setView, sidebarWide, view }) {
  const [openSubmenu, setOpenSubmenu] = useState("Dashboard");

  function go(nextView) {
    setView(nextView);
    setIsMobileOpen(false);
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-50 mt-16 flex h-screen flex-col border-r border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 lg:mt-0 ${sidebarWide ? "w-[290px]" : "w-[90px]"} ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex py-8 ${!sidebarWide ? "lg:justify-center" : "justify-start"}`}>
        <button type="button" onClick={() => go("overview")} className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-500 text-xs font-bold text-white shadow-theme-sm">T</span>
          {sidebarWide ? (
            <span className="text-left">
              <span className="block text-xl font-semibold tracking-tight text-gray-900 dark:text-white">TDO Links</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">Affiliate Admin</span>
            </span>
          ) : null}
        </button>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <MenuGroup title="Menu" sidebarWide={sidebarWide}>
            {navItems.map((item) => (
              <NavButton
                key={item.name}
                item={item}
                open={openSubmenu === item.name}
                setOpen={() => setOpenSubmenu(openSubmenu === item.name ? "" : item.name)}
                sidebarWide={sidebarWide}
                view={view}
                go={go}
              />
            ))}
          </MenuGroup>
          <MenuGroup title="Others" sidebarWide={sidebarWide}>
            {othersItems.map((item) => <NavButton key={item.name} item={item} sidebarWide={sidebarWide} view={view} go={go} />)}
          </MenuGroup>
        </nav>
        {sidebarWide ? (
          <div className="mb-6 rounded-2xl bg-gray-50 px-4 py-5 text-center dark:bg-white/[0.03]">
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">TDO Links Admin</h3>
            <p className="mb-4 text-xs leading-5 text-gray-500 dark:text-gray-400">Pipeline de ofertas, aprovacao e cliques rastreaveis.</p>
            <button type="button" onClick={() => go("operation")} className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-xs font-medium text-white transition hover:bg-brand-600">Abrir operacao</button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function MenuGroup({ title, sidebarWide, children }) {
  return (
    <div className="mb-6">
      <h2 className={`mb-4 flex text-xs uppercase leading-[20px] text-gray-400 ${!sidebarWide ? "lg:justify-center" : "justify-start"}`}>
        {sidebarWide ? title : <Grid3X3 className="size-5" />}
      </h2>
      <ul className="flex flex-col gap-4">{children}</ul>
    </div>
  );
}

function NavButton({ item, open, setOpen, sidebarWide, view, go }) {
  const Icon = item.icon;
  const active = item.view === view || item.subItems?.some((sub) => sub.view === view);
  if (item.subItems) {
    return (
      <li>
        <button type="button" onClick={setOpen} className={`menu-item group cursor-pointer ${active || open ? "menu-item-active" : "menu-item-inactive"} ${!sidebarWide ? "lg:justify-center" : "lg:justify-start"}`}>
          <span className={`menu-item-icon-size ${active || open ? "menu-item-icon-active" : "menu-item-icon-inactive"}`}><Icon /></span>
          {sidebarWide ? <span className="menu-item-text">{item.name}</span> : null}
          {sidebarWide ? <ChevronDown className={`ml-auto size-5 transition-transform duration-200 ${open ? "rotate-180 text-brand-500" : "text-gray-500"}`} /> : null}
        </button>
        {sidebarWide ? (
          <div className="overflow-hidden transition-all duration-300" style={{ height: open ? `${item.subItems.length * 42}px` : "0px" }}>
            <ul className="ml-9 mt-2 space-y-1">
              {item.subItems.map((sub) => (
                <li key={sub.name}>
                  <button type="button" onClick={() => go(sub.view)} className={`menu-dropdown-item w-full ${sub.view === view ? "menu-dropdown-item-active" : "menu-dropdown-item-inactive"}`}>
                    {sub.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </li>
    );
  }
  return (
    <li>
      <button type="button" onClick={() => go(item.view)} className={`menu-item group ${active ? "menu-item-active" : "menu-item-inactive"} ${!sidebarWide ? "lg:justify-center" : "lg:justify-start"}`}>
        <span className={`menu-item-icon-size ${active ? "menu-item-icon-active" : "menu-item-icon-inactive"}`}><Icon /></span>
        {sidebarWide ? <span className="menu-item-text">{item.name}</span> : null}
      </button>
    </li>
  );
}

function Header({ appMenuOpen, darkMode, inputRef, query, setAppMenuOpen, setDarkMode, setIsExpanded, setIsMobileOpen, setQuery, state }) {
  function toggleSidebar() {
    if (window.innerWidth >= 1024) setIsExpanded((value) => !value);
    else setIsMobileOpen((value) => !value);
  }
  return (
    <header className="sticky top-0 z-99999 flex w-full border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:border-b">
      <div className="flex grow flex-col items-center justify-between lg:flex-row lg:px-6">
        <div className="flex w-full items-center justify-between gap-2 border-b border-gray-200 px-3 py-3 dark:border-gray-800 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-4">
          <button type="button" onClick={toggleSidebar} className="z-99999 flex size-10 items-center justify-center rounded-lg border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400 lg:size-11 lg:border" aria-label="Toggle Sidebar">
            <Menu className="size-5" />
          </button>
          <button type="button" className="flex items-center gap-2 lg:hidden">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-500 text-xs font-bold text-white">T</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">TDO Links</span>
          </button>
          <button type="button" onClick={() => setAppMenuOpen((value) => !value)} className="z-99999 flex size-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden">
            <Grid3X3 className="size-5" />
          </button>
          <div className="hidden lg:block">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
                <Search className="size-5 text-gray-500 dark:text-gray-400" />
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="text"
                placeholder="Buscar oferta, canal, status ou comando..."
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 xl:w-[430px]"
              />
              <span className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                <span>Ctrl</span><span>K</span>
              </span>
            </div>
          </div>
        </div>
        <div className={`${appMenuOpen ? "flex" : "hidden"} w-full flex-wrap items-center justify-between gap-3 px-4 py-4 shadow-theme-md lg:flex lg:flex-nowrap lg:justify-end lg:px-0 lg:shadow-none`}>
          <div className="flex items-center gap-2 2xsm:gap-3">
            <button type="button" onClick={() => setDarkMode((value) => !value)} className="flex size-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
              {darkMode ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <button type="button" className="relative flex size-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
              <span className="absolute right-2 top-2 size-2 rounded-full bg-orange-400" />
              <Bell className="size-5" />
            </button>
          </div>
          <button type="button" className="flex min-w-0 items-center text-gray-700 dark:text-gray-400">
            <span className="mr-3 grid size-11 place-items-center rounded-full bg-brand-500 text-sm font-semibold text-white">A</span>
            <span className="mr-1 block min-w-0 text-left">
              <span className="block truncate text-sm font-medium text-gray-700 dark:text-gray-400">Antonio</span>
              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{state.settings.mode}</span>
            </span>
            <ChevronDown className="size-5 shrink-0 text-gray-400" />
          </button>
        </div>
      </div>
    </header>
  );
}

function PageTitle({ view }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">{viewTitles[view]}</h2>
      <nav>
        <ol className="flex items-center gap-1.5">
          <li className="text-sm text-gray-500 dark:text-gray-400">Home</li>
          <li className="text-sm text-gray-500 dark:text-gray-400">/</li>
          <li className="text-sm text-gray-800 dark:text-white/90">{viewTitles[view]}</li>
        </ol>
      </nav>
    </div>
  );
}

function Overview({ state, data, setPeriod, period, setView }) {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12 space-y-6 xl:col-span-7">
        <Metrics state={state} data={data} />
        <SalesChart data={data} period={period} setPeriod={setPeriod} />
      </div>
      <div className="col-span-12 xl:col-span-5">
        <TargetCard data={data} setView={setView} />
      </div>
      <div className="col-span-12">
        <StatisticsCard data={data} />
      </div>
      <div className="col-span-12 xl:col-span-5">
        <ChannelsCard data={data} />
      </div>
      <div className="col-span-12 xl:col-span-7">
        <RecentOffers state={state} data={data} />
      </div>
    </div>
  );
}

function Metrics({ state, data }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
      <Metric icon={CheckCircle2} label="Pronto para publicar" value={data.autoReady} badge="verde" color={data.autoReady ? "success" : "gray"} />
      <Metric icon={AlertTriangle} label="Bloqueado por link" value={data.missingAffiliate} badge="corrigir" color={data.missingAffiliate ? "warning" : "success"} />
      <Metric icon={Send} label="Publicados" value={state.metrics.published} badge="Telegram" color="brand" />
      <Metric icon={MousePointerClick} label="Cliques" value={state.metrics.clicks} badge={`${data.clickRate}%`} color="success" />
    </div>
  );
}

function Metric({ icon: Icon, label, value, badge, color }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="flex size-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
        <Icon className="size-6 text-gray-800 dark:text-white/90" />
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
          <h4 className="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">{value}</h4>
        </div>
        <Badge color={color}>{badge}</Badge>
      </div>
    </div>
  );
}

function SalesChart({ data, period, setPeriod }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Atividade por horario</h3>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">Atividade por horario no periodo selecionado.</p>
        </div>
        <select value={period} onChange={(event) => setPeriod(event.target.value)} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 shadow-theme-xs outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 sm:w-auto">
          {periods.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>
      <Heatmap heatmap={data.heatmap} />
    </div>
  );
}

function TargetCard({ data, setView }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Saude da operacao</h3>
          <button type="button" onClick={() => setView(data.rec.action.view)} className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.05] dark:hover:text-gray-300">
            <ExternalLink className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">{data.rec.text}</p>
      </div>
      <div className="mx-auto flex min-h-[260px] max-w-[330px] items-center justify-center px-5 py-8">
        <div className="relative grid size-48 place-items-center rounded-full border-[18px] border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className={`absolute inset-[-18px] rounded-full border-[18px] ${data.healthTone === "critical" ? "border-error-500" : data.healthTone === "warning" ? "border-warning-500" : "border-brand-500"}`} style={{ clipPath: `inset(${100 - data.healthScore}% 0 0 0)` }} />
          <div className="relative text-center">
            <span className="text-title-sm font-bold text-gray-800 dark:text-white/90">{data.healthScore}%</span>
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">Saude</p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{data.rec.title}</p>
        <button type="button" onClick={() => setView(data.rec.action.view)} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-theme-sm font-medium text-white shadow-theme-xs hover:bg-brand-600">
          {data.rec.action.label}
        </button>
      </div>
    </div>
  );
}

function StatisticsCard({ data }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Funil de ofertas</h3>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">Distribuicao por status, canal e categoria.</p>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Bars title="Status" items={data.statusBars} />
        <Bars title="Canais" items={data.channelBars} />
        <Bars title="Categorias" items={data.categoryBars} />
      </div>
    </div>
  );
}

function ChannelsCard({ data }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Alertas operacionais</h3>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">Leitura operacional dos canais e lojas.</p>
      <div className="mt-6 space-y-4">
        {data.alerts.length ? data.alerts.map((alert) => (
          <AlertItem key={alert.title} alert={alert} />
        )) : <AlertItem alert={{ title: "Pipeline estavel", text: "Nenhum alerta operacional agora.", tone: "success" }} />}
      </div>
    </div>
  );
}

function RecentOffers({ state, data }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Melhores oportunidades</h3>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            <SlidersHorizontal className="size-5" /> Filter
          </button>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            See all
          </button>
        </div>
      </div>
      <OfferTable offers={data.topOffers} clicksByOffer={state.metrics.clicksByOffer} />
    </div>
  );
}

function Operation({ state, data, drafts, loading, api, action }) {
  return (
    <div className="space-y-4 md:space-y-6">
      <ActionPanel data={data} loading={loading} api={api} action={action} />
      <div className="grid gap-4 xl:grid-cols-3">
        {draftColumns.map(([column, title]) => {
          const columnDrafts = drafts.filter((draft) => draftColumn(draft) === column);
          return (
            <Panel key={column} title={title} count={`${columnDrafts.length}`}>
              <div className="max-h-[760px] space-y-4 overflow-y-auto pr-1 custom-scrollbar">
                {columnDrafts.map((draft) => {
                  const offer = state.offers.find((item) => item.id === draft.offerId);
                  return <DraftCard key={draft.id} draft={draft} offer={offer} loading={loading} api={api} action={action} />;
                })}
                {!columnDrafts.length ? <EmptyState title="Fila vazia" text="Nenhum draft neste status." /> : null}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function ActionPanel({ data, loading, api, action }) {
  return (
    <Panel title="Acoes operacionais" count={`${data.pending} pendentes`}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Button className="w-full" loading={loading.scrape} onClick={() => action("scrape", () => api("/api/run/scrape", { method: "POST" }), "Ofertas coletadas")}><Search className="size-4" /> Buscar ofertas</Button>
        <Button className="w-full" loading={loading.publish} onClick={() => action("publish", () => api("/api/run/publish", { method: "POST" }), "Publicacao executada")}><Send className="size-4" /> Publicar elegiveis</Button>
        <Button className="w-full" variant="outline" loading={loading.report} onClick={() => action("report", () => api("/api/run/report", { method: "POST" }), "Relatorio gerado")}><BarChart3 className="size-4" /> Gerar relatorio</Button>
        <Button className="w-full" variant="outline" loading={loading.refreshAffiliates} onClick={() => action("refreshAffiliates", () => api("/api/run/refresh-affiliates", { method: "POST" }), "Links recalculados")}><RefreshCcw className="size-4" /> Recalcular afiliados</Button>
      </div>
      <p className="mt-3 text-theme-xs leading-5 text-gray-500 dark:text-gray-400">Se nada sair no Telegram, consulte Configuracao no Railway: `TELEGRAM_DRY_RUN=false`, token e chat id precisam estar preenchidos.</p>
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
    <article className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <Badge color={badgeColor(draft.status)}>{statusLabel(draft.status)}</Badge>
          <h4 className="mt-3 line-clamp-2 text-theme-sm font-medium text-gray-800 dark:text-white/90">{offer?.title || "Post de aquisicao X"}</h4>
          <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">{channelLabel(draft.channel)} {offer ? `- ${money(offer.currentPrice)}` : ""}</p>
          {offer?.validationSummary ? (
            <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">{offer.validationSummary}</p>
          ) : null}
          {offer?.scoreBreakdown ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
              <span>Confianca {offer.scoreBreakdown.reliability}</span>
              <span>Atratividade {offer.scoreBreakdown.attractiveness}</span>
              <span>Potencial {offer.scoreBreakdown.potential}</span>
              <span>Historico {offer.scoreBreakdown.performance}</span>
            </div>
          ) : null}
        </div>
        {draft.channel === "x" ? <Zap className="size-5 text-gray-400" /> : <Send className="size-5 text-gray-400" />}
      </div>
      <textarea value={text} onChange={(event) => setText(event.target.value)} rows={7} className="w-full resize-y rounded-lg border border-gray-200 bg-gray-50 p-3 text-theme-sm leading-5 text-gray-700 outline-hidden focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300" />
      {draft.warnings?.length ? (
        <div className="mt-3 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-theme-xs leading-5 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-300">
          {draft.warnings.map(warningLabel).join(" ")}
        </div>
      ) : null}
      {draft.rejectionReason ? <p className="mt-2 text-theme-xs text-error-500">{draft.rejectionReason}</p> : null}
      {offer ? (
        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-theme-xs font-medium text-gray-700 dark:text-gray-300">Link afiliado oficial</span>
            <Badge color={offer.affiliateSource === "manual" ? "success" : "warning"}>{offer.affiliateSource === "manual" ? "SiteStripe salvo" : "Pendente"}</Badge>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={affiliateUrl}
              onChange={(event) => setAffiliateUrl(event.target.value)}
              placeholder="Cole o link do SiteStripe ou amzn.to"
              className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-theme-sm text-gray-700 outline-hidden focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
            />
            <Button
              size="sm"
              className="h-10 sm:w-auto"
              variant="outline"
              loading={loading[`affiliate-${offer.id}`]}
              disabled={!affiliateUrl.trim()}
              onClick={() => action(`affiliate-${offer.id}`, () => api(`/api/offers/${offer.id}/affiliate`, { method: "POST", body: { affiliateUrl } }), "Link afiliado salvo")}
            >
              Salvar link
            </Button>
          </div>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.includes("approve") ? <Button size="sm" loading={loading[`approve-${draft.id}`]} onClick={() => action(`approve-${draft.id}`, () => api(`/api/drafts/${draft.id}/approve`, { method: "POST" }), "Draft aprovado")}><CheckCircle2 className="size-4" /> Aprovar</Button> : null}
        {actions.includes("edit") ? <Button size="sm" variant="outline" loading={loading[`edit-${draft.id}`]} onClick={() => action(`edit-${draft.id}`, () => api(`/api/drafts/${draft.id}/edit`, { method: "POST", body: { text } }), "Draft salvo")}><FileText className="size-4" /> Salvar</Button> : null}
        {actions.includes("regenerate") ? <Button size="sm" variant="outline" loading={loading[`regen-${draft.id}`]} onClick={() => action(`regen-${draft.id}`, () => api(`/api/drafts/${draft.id}/regenerate`, { method: "POST" }), "Texto regenerado")}><RefreshCcw className="size-4" /> Regenerar</Button> : null}
        {actions.includes("clone") ? <Button size="sm" variant="outline" loading={loading[`clone-${draft.id}`]} onClick={() => action(`clone-${draft.id}`, () => api(`/api/drafts/${draft.id}/clone`, { method: "POST" }), "Draft duplicado")}><Copy className="size-4" /> Clonar</Button> : null}
        {actions.includes("reject") ? <Button size="sm" variant="danger" loading={loading[`reject-${draft.id}`]} onClick={() => action(`reject-${draft.id}`, () => api(`/api/drafts/${draft.id}/reject`, { method: "POST", body: { reason: "Rejeitado no dashboard." } }), "Draft rejeitado")}><X className="size-4" /> Rejeitar</Button> : null}
      </div>
    </article>
  );
}

function Offers({ state, data, offers, loading, api, action }) {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12">
        <StatisticsCard data={data} />
      </div>
      <div className="col-span-12">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Ofertas</h3>
            <div className="sm:shrink-0">
              <Badge color={data.missingAffiliate ? "warning" : "success"}>{data.missingAffiliate} afiliado pendente</Badge>
            </div>
          </div>
          <OfferTable offers={offers} clicksByOffer={state.metrics.clicksByOffer} loading={loading} api={api} action={action} />
        </div>
      </div>
    </div>
  );
}

function Reports({ state, data, loading, api, action }) {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12 xl:col-span-4">
        <Panel title="Recomendacoes" count={`${data.healthScore}/100`}>
          <p className="text-theme-sm leading-6 text-gray-500 dark:text-gray-400">Relatorios analisam cliques, categorias e gargalos do funil.</p>
          <Button className="mt-4" loading={loading.report} onClick={() => action("report", () => api("/api/run/report", { method: "POST" }), "Relatorio gerado")}><BarChart3 className="size-4" /> Gerar relatorio</Button>
        </Panel>
      </div>
      <div className="col-span-12 xl:col-span-8">
        <Panel title="Recomendacoes operacionais" count={`${(state.recommendations || data.recommendations || []).length}`}>
          <div className="space-y-3">
            {(state.recommendations || data.recommendations || []).map((rec) => (
              <article key={rec.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                <Badge color={rec.severity === "critical" ? "error" : rec.severity === "success" ? "success" : "brand"}>{rec.type}</Badge>
                <h4 className="mt-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">{rec.title}</h4>
                <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">{rec.detail}</p>
              </article>
            ))}
            {!(state.recommendations || data.recommendations || []).length ? <EmptyState title="Sem recomendacoes" text="Gere uma analise para receber novas recomendacoes." /> : null}
          </div>
        </Panel>
      </div>
      <div className="col-span-12">
        <Panel title="Historico de relatorios" count={`${state.reports.length}`}>
          <div className="space-y-4">
            {state.reports.length ? state.reports.map((report) => (
              <article key={report.id} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                <span className="text-theme-xs text-gray-500 dark:text-gray-400">{report.period}</span>
                <h4 className="mt-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">{report.expectedImpact}</h4>
                <p className="mt-2 text-theme-sm leading-6 text-gray-500 dark:text-gray-400">{report.conclusions.join(" ")}</p>
                <p className="mt-2 text-theme-sm leading-6 text-gray-500 dark:text-gray-400">{report.suggestions.join(" ")}</p>
              </article>
            )) : <EmptyState title="Nenhum relatorio" text="Gere uma analise para popular este painel." />}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Config({ state, data, loading, api, action }) {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12 xl:col-span-4">
        <Panel title="Automacao" count={modeLabel(state.settings.mode)}>
          <label className="text-theme-sm font-medium text-gray-700 dark:text-gray-300">Modo de publicacao</label>
          <select value={state.settings.mode} onChange={(event) => action("mode", () => api("/api/settings", { method: "POST", body: { mode: event.target.value } }), "Modo atualizado")} className="mt-3 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 shadow-theme-xs outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            <option value="limited">Automatico limitado</option>
            <option value="manual">Manual</option>
            <option value="paused">Pausado</option>
          </select>
        </Panel>
      </div>
      <div className="col-span-12 xl:col-span-4">
        <Panel title="Links afiliados" count={`${data.missingAffiliate} pendentes`}>
          <p className="text-theme-sm leading-6 text-gray-500 dark:text-gray-400">Recalcula URLs afiliadas usando as variaveis atuais do ambiente.</p>
          <Button className="mt-4" loading={loading.refreshAffiliates} onClick={() => action("refreshAffiliates", () => api("/api/run/refresh-affiliates", { method: "POST" }), "Links recalculados")}><RefreshCcw className="size-4" /> Recalcular</Button>
        </Panel>
      </div>
      <div className="col-span-12 xl:col-span-4">
        <Panel title="Telegram" count={state.diagnostics?.telegram?.ready ? "Pronto" : "Revisar"}>
          <div className="space-y-2 text-theme-sm text-gray-500 dark:text-gray-400">
            <p>Dry-run: {state.diagnostics?.telegram?.dryRun ? "Ligado" : "Desligado"}</p>
            <p>Bot token: {state.diagnostics?.telegram?.hasBotToken ? "Configurado" : "Ausente"}</p>
            <p>Chat ID: {state.diagnostics?.telegram?.hasChatId ? "Configurado" : "Ausente"}</p>
          </div>
          <Button className="mt-4" variant="outline" loading={loading.telegramTest} onClick={() => action("telegramTest", () => api("/api/integrations/telegram/test", { method: "POST" }), "Teste Telegram executado")}>
            <Send className="size-4" /> Testar Telegram
          </Button>
        </Panel>
      </div>
      <div className="col-span-12 xl:col-span-4">
        <Panel title="Saude" count={`${data.healthScore}/100`}>
          <div className="space-y-3">{data.alerts.map((alert) => <AlertItem key={alert.title} alert={alert} />)}</div>
        </Panel>
      </div>
    </div>
  );
}

function OfferTable({ offers, clicksByOffer, loading, api, action }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="min-w-[980px]">
        <thead className="border-y border-gray-100 dark:border-gray-800">
          <tr>
            {["Oferta", "Categoria", "Preco", "Status", "Afiliado", "Abrir"].map((header) => (
              <th key={header} className="px-3 py-3 text-start text-theme-xs font-medium text-gray-500 first:pl-0 last:pr-0 dark:text-gray-400">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {offers.map((offer) => (
            <tr key={offer.id}>
              <td className="py-3 pr-3">
                <a href={offerOpenUrl(offer)} target="_blank" rel="noreferrer" className="flex items-center gap-3">
                  <ProductThumb offer={offer} />
                  <div>
                    <p className="line-clamp-2 max-w-[360px] text-theme-sm font-medium text-gray-800 dark:text-white/90">{offer.title}</p>
                    <span className="text-theme-xs text-gray-500 dark:text-gray-400">{storeLabel(offer.store)} - {clicksByOffer[offer.id] || 0} cliques</span>
                  </div>
                </a>
              </td>
              <td className="px-3 py-3 text-theme-sm text-gray-500 dark:text-gray-400">{offer.category || "Tech"}</td>
              <td className="px-3 py-3 text-theme-sm text-gray-500 dark:text-gray-400">{money(offer.currentPrice)}</td>
              <td className="px-3 py-3 text-theme-sm text-gray-500 dark:text-gray-400"><Badge color={badgeColor(offer.status)}>{statusLabel(offer.status)}</Badge></td>
              <td className="py-3 pl-3 text-theme-sm text-gray-500 dark:text-gray-400">
                {api && action ? <InlineAffiliateForm offer={offer} loading={loading} api={api} action={action} /> : <Badge color={offer.affiliateReady ? "success" : "warning"}>{offer.affiliateReady ? "Pronto" : "Pendente"}</Badge>}
              </td>
              <td className="py-3 pl-3 text-theme-sm text-gray-500 dark:text-gray-400">
                <a href={offerOpenUrl(offer)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-theme-xs font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]">
                  <ExternalLink className="size-4" /> Abrir
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!offers.length ? <EmptyState title="Nenhuma oferta" text="Execute a coleta para popular a tabela." /> : null}
    </div>
  );
}

function InlineAffiliateForm({ offer, loading, api, action }) {
  const [affiliateUrl, setAffiliateUrl] = useState(offer.affiliateSource === "manual" ? offer.affiliateUrl || "" : "");
  useEffect(() => setAffiliateUrl(offer.affiliateSource === "manual" ? offer.affiliateUrl || "" : ""), [offer.affiliateUrl, offer.affiliateSource]);
  return (
    <div className="flex min-w-[260px] items-center gap-2">
      <input
        value={affiliateUrl}
        onChange={(event) => setAffiliateUrl(event.target.value)}
        placeholder="SiteStripe/amzn.to"
        className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-theme-xs text-gray-700 outline-hidden focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
      />
      <Button
        size="sm"
        variant={offer.affiliateSource === "manual" ? "outline" : "primary"}
        loading={loading?.[`affiliate-${offer.id}`]}
        disabled={!affiliateUrl.trim()}
        onClick={() => action(`affiliate-${offer.id}`, () => api(`/api/offers/${offer.id}/affiliate`, { method: "POST", body: { affiliateUrl } }), "Link afiliado salvo")}
      >
        Salvar
      </Button>
    </div>
  );
}

function Panel({ title, count, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h3>
        {count ? <span className="shrink-0 text-theme-sm text-gray-500 dark:text-gray-400">{count}</span> : null}
      </div>
      {children}
    </div>
  );
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

function Button({ children, loading, variant = "primary", size = "md", className = "", ...props }) {
  const variantClass = {
    primary: "bg-brand-500 text-white hover:bg-brand-600 disabled:bg-brand-400",
    outline: "border border-gray-300 bg-white text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]",
    danger: "border border-error-200 bg-error-50 text-error-600 hover:bg-error-100 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
  }[variant];
  const sizeClass = size === "sm" ? "h-9 px-3 text-theme-xs" : "h-11 px-4 text-theme-sm";
  return (
    <button type="button" disabled={loading || props.disabled} className={`inline-flex min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-70 [&>svg]:shrink-0 ${variantClass} ${sizeClass} ${className}`} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

function Badge({ color = "brand", children }) {
  const classes = {
    success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
    error: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500",
    warning: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-400",
    brand: "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400",
    gray: "bg-gray-100 text-gray-700 dark:bg-white/[0.03] dark:text-gray-400"
  }[color] || "bg-brand-50 text-brand-500";
  return <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${classes}`}>{children}</span>;
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
  const blocked = state.offers.filter((offer) => offer.validationStatus === "blocked" || offer.status === "blocked").length;
  const ready = state.offers.filter((offer) => offer.validationStatus === "ready" || offer.status === "auto_ready").length;
  const needsReviewOffers = state.offers.filter((offer) => offer.validationStatus === "needs_review").length;
  const failed = state.drafts.filter((draft) => ["failed", "blocked", "rejected"].includes(draft.status)).length;
  const clickRate = Math.round((clicks.length / Math.max(publishedDrafts.length, 1)) * 100);
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
  return { pending, autoReady, reviewDrafts, missingAffiliate, blocked, ready, needsReviewOffers, failed, clickRate, healthScore, healthTone, heatmap, statusBars, channelBars, categoryBars, topOffers, alerts, rec, recommendations: state.recommendations || [] };
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
function badgeColor(status) {
  return {
    auto_ready: "success",
    needs_review: "warning",
    approved: "brand",
    published: "success",
    archived: "gray",
    rejected: "error",
    failed: "error",
    blocked: "error"
  }[status] || "gray";
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
