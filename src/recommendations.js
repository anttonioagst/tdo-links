export function buildRecommendations(state) {
  const recommendations = [];
  const offers = state.offers || [];
  const drafts = state.drafts || [];
  const clicks = state.clicks || [];
  const publishLog = state.publishLog || [];

  const missingAffiliate = offers.filter((offer) => !offer.affiliateReady);
  if (missingAffiliate.length) {
    recommendations.push({
      id: "fix_affiliate",
      type: "fix_affiliate",
      severity: "critical",
      title: "Links afiliados pendentes",
      detail: `${missingAffiliate.length} ofertas ainda nao podem monetizar.`,
      actionLabel: "Abrir ofertas",
      actionView: "offers",
      evidence: missingAffiliate.slice(0, 5).map((offer) => offer.title)
    });
  }

  const readyDrafts = drafts.filter((draft) => ["auto_ready", "approved"].includes(draft.status) && draft.channel === "telegram");
  if (readyDrafts.length) {
    recommendations.push({
      id: "publish_ready",
      type: "publish_ready",
      severity: "success",
      title: "Publicar ofertas prontas",
      detail: `${readyDrafts.length} drafts Telegram estao elegiveis.`,
      actionLabel: "Abrir operacao",
      actionView: "operation",
      evidence: readyDrafts.slice(0, 5).map((draft) => draft.id)
    });
  }

  const failedPublishes = publishLog.filter((entry) => entry.result && entry.result.ok === false);
  if (failedPublishes.length) {
    recommendations.push({
      id: "fix_publish_errors",
      type: "fix_publish_errors",
      severity: "critical",
      title: "Falhas de publicacao",
      detail: `${failedPublishes.length} tentativas de publicacao falharam.`,
      actionLabel: "Abrir configuracao",
      actionView: "config",
      evidence: failedPublishes.slice(0, 3).map((entry) => entry.result.detail || entry.id)
    });
  }

  const clicksByOffer = new Map();
  for (const click of clicks) clicksByOffer.set(click.offerId, (clicksByOffer.get(click.offerId) || 0) + 1);
  const top = [...clicksByOffer.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) {
    const offer = offers.find((item) => item.id === top[0]);
    recommendations.push({
      id: "repeat_winner",
      type: "repeat_winner",
      severity: "info",
      title: "Repetir categoria vencedora",
      detail: `${offer?.title || top[0]} lidera com ${top[1]} cliques.`,
      actionLabel: "Ver relatorios",
      actionView: "ai",
      evidence: [offer?.category || "categoria desconhecida"]
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      id: "stable_pipeline",
      type: "stable_pipeline",
      severity: "info",
      title: "Pipeline estavel",
      detail: "Nenhuma acao critica pendente agora.",
      actionLabel: "Buscar ofertas",
      actionView: "operation",
      evidence: []
    });
  }

  return recommendations;
}
