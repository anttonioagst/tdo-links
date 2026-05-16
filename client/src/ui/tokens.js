import {
  BarChart3,
  GitBranch,
  Send,
  Settings,
  XCircle
} from "lucide-react";

export const commandItems = [
  { view: "overview", label: "Performance", icon: BarChart3 },
  { view: "pipeline", label: "Pipeline", icon: GitBranch },
  { view: "feed", label: "Publicacoes", icon: Send },
  { view: "rejected", label: "Rejeitados", icon: XCircle },
  { view: "config", label: "Config", icon: Settings }
];

export const viewMeta = {
  overview: {
    title: "Performance",
    subtitle: "Metricas de publicacao, atividade e saude do pipeline autonomo.",
    density: "comfortable"
  },
  pipeline: {
    title: "Pipeline",
    subtitle: "Status dos 4 agentes: Discovery → Validation → Creative → Publisher.",
    density: "comfortable"
  },
  feed: {
    title: "Publicacoes",
    subtitle: "Feed de deals publicados por canal com message IDs.",
    density: "compact"
  },
  rejected: {
    title: "Rejeitados",
    subtitle: "Deals descartados pela AI com motivo da validacao.",
    density: "compact"
  },
  config: {
    title: "Configuracao",
    subtitle: "Threshold de confianca, canais ativos e intervalo do cron.",
    density: "comfortable"
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
