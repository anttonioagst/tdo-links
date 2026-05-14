import {
  BarChart3,
  Bot,
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
