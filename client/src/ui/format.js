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
