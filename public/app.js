let state = null;
let query = "";

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
  state = await api("/api/state");
  renderAttention();
  renderMetrics();
  renderSettings();
  renderAlerts();
  renderDrafts();
  renderOffers();
  renderReports();
}

function renderAttention() {
  const autoReady = state.offers.filter((offer) => offer.status === "auto_ready").length;
  const reviewDrafts = state.drafts.filter((draft) => draft.status === "needs_review").length;
  const missingAffiliate = state.offers.filter((offer) => !offer.affiliateReady).length;

  let tone = "stable";
  let title = "Pipeline estavel";
  let description = "Nenhuma acao critica pendente agora.";
  let nextAction = "Continue monitorando as ofertas e os cliques.";

  if (missingAffiliate) {
    tone = "critical";
    title = "Falta configurar afiliado em algumas ofertas";
    description = `${missingAffiliate} ofertas ainda nao estao prontas para monetizacao.`;
    nextAction = "Configure o afiliado da loja antes de publicar essas ofertas.";
  } else if (autoReady) {
    tone = "ready";
    title = "Ha ofertas prontas para publicar";
    description = `${autoReady} ofertas passaram no score automatico.`;
    nextAction = "Clique em Publicar elegiveis para enviar ao Telegram.";
  } else if (reviewDrafts) {
    tone = "warning";
    title = "Ha drafts aguardando revisao";
    description = `${reviewDrafts} drafts precisam de aprovacao humana.`;
    nextAction = "Revise os textos na fila de publicacao.";
  }

  document.getElementById("attentionPanel").className = `attention ${tone}`;
  document.getElementById("attentionPanel").innerHTML = `
    <div>
      <p class="sectionLabel">Proxima acao recomendada</p>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(description)}</p>
    </div>
    <div class="nextAction">
      <span>Acao</span>
      <strong>${escapeHtml(nextAction)}</strong>
    </div>
  `;
}

function renderMetrics() {
  document.getElementById("metrics").innerHTML = [
    metric("Ofertas", state.metrics.offers),
    metric("Pendentes", pendingDrafts()),
    metric("Publicados", state.metrics.published),
    metric("Cliques", state.metrics.clicks)
  ].join("");
}

function metric(label, value) {
  return `<article class="metric"><strong>${value}</strong><span>${label}</span></article>`;
}

function renderSettings() {
  document.getElementById("modeSelect").value = state.settings.mode;
}

function renderAlerts() {
  const alerts = [];
  const autoReady = state.offers.filter((offer) => offer.status === "auto_ready").length;
  const reviewDrafts = state.drafts.filter((draft) => draft.status === "needs_review").length;
  const failedDrafts = state.drafts.filter((draft) => ["failed", "blocked"].includes(draft.status)).length;
  const missingAffiliate = state.offers.filter((offer) => !offer.affiliateReady).length;

  if (autoReady) alerts.push({ tone: "ready", title: "Pronto para enviar", text: `${autoReady} ofertas elegiveis.` });
  if (reviewDrafts) alerts.push({ tone: "warning", title: "Requer revisao", text: `${reviewDrafts} drafts aguardando aprovacao.` });
  if (failedDrafts) alerts.push({ tone: "critical", title: "Falha de publicacao", text: `${failedDrafts} drafts com erro ou bloqueio.` });
  if (missingAffiliate) alerts.push({ tone: "critical", title: "Afiliado pendente", text: `${missingAffiliate} ofertas sem afiliado.` });
  if (!alerts.length) alerts.push({ tone: "stable", title: "Tudo certo", text: "Sistema sem alertas criticos." });

  document.getElementById("alerts").innerHTML = alerts.map((alert) => `
    <article class="alertItem ${alert.tone}">
      <strong>${escapeHtml(alert.title)}</strong>
      <span>${escapeHtml(alert.text)}</span>
    </article>
  `).join("");
}

function renderDrafts() {
  const drafts = filterItems(state.drafts, (draft) => {
    const offer = state.offers.find((item) => item.id === draft.offerId);
    return `${draft.channel} ${draft.status} ${draft.text} ${offer?.title || ""}`;
  });

  document.getElementById("draftSummary").textContent = `${pendingDrafts()} pendentes`;
  document.getElementById("drafts").innerHTML = drafts.map((draft) => {
    const offer = state.offers.find((item) => item.id === draft.offerId);
    return `
      <article class="draftCard ${draft.status}">
        <div class="cardTop">
          <span class="status ${draft.status}">${statusLabel(draft.status)}</span>
          <span class="channel">${escapeHtml(draft.channel)}</span>
        </div>
        <h3>${escapeHtml(offer?.title || "Post de aquisicao X")}</h3>
        <textarea id="text_${draft.id}" rows="5">${escapeHtml(draft.text)}</textarea>
        ${draft.rejectionReason ? `<p class="muted">Motivo: ${escapeHtml(draft.rejectionReason)}</p>` : ""}
        <div class="row">
          <button onclick="approveDraft('${draft.id}')">Aprovar</button>
          <button class="secondary" onclick="editDraft('${draft.id}')">Salvar edicao</button>
          <button class="secondary" onclick="regenerateDraft('${draft.id}')">Regenerar texto</button>
          <button class="secondary" onclick="cloneDraft('${draft.id}')">Duplicar teste</button>
          <button class="danger" onclick="rejectDraft('${draft.id}')">Rejeitar</button>
        </div>
      </article>
    `;
  }).join("") || `<p class="muted">Nenhum draft encontrado.</p>`;
}

function renderOffers() {
  const offers = filterItems(state.offers, (offer) => `${offer.store} ${offer.status} ${offer.title}`);
  document.getElementById("offers").innerHTML = offers.map((offer) => `
    <article class="offerCard ${offer.status}">
      ${offer.imageUrl ? `<img class="offerImage" src="${escapeHtml(offer.imageUrl)}" alt="" />` : `<div class="offerImage empty">IMG</div>`}
      <div>
        <div class="cardTop">
          <span class="status ${offer.status}">${statusLabel(offer.status)}</span>
          <span class="mono">score ${offer.score}</span>
        </div>
        <h3>${escapeHtml(offer.title)}</h3>
        <p class="muted">R$ ${Number(offer.currentPrice).toFixed(2)} · ${offer.discountPercent}% off · ${state.metrics.clicksByOffer[offer.id] || 0} cliques</p>
        <p class="${offer.affiliateReady ? "okText" : "dangerText"}">${offer.affiliateReady ? "Afiliado configurado" : "Falta configurar afiliado"}</p>
      </div>
    </article>
  `).join("") || `<p class="muted">Nenhuma oferta encontrada.</p>`;
}

function renderReports() {
  document.getElementById("reports").innerHTML = state.reports.map((report) => `
    <article class="reportCard">
      <span class="mono">${escapeHtml(report.period)}</span>
      <h3>${escapeHtml(report.expectedImpact)}</h3>
      <p>${escapeHtml(report.conclusions.join(" "))}</p>
      <p class="muted">${escapeHtml(report.suggestions.join(" "))}</p>
    </article>
  `).join("") || `<p class="muted">Nenhum relatorio gerado.</p>`;
}

async function approveDraft(id) {
  await api(`/api/drafts/${id}/approve`, { method: "POST" });
  await refresh();
}

async function rejectDraft(id) {
  await api(`/api/drafts/${id}/reject`, { method: "POST", body: { reason: "Rejeitado no dashboard." } });
  await refresh();
}

async function editDraft(id) {
  const text = document.getElementById(`text_${id}`).value;
  await api(`/api/drafts/${id}/edit`, { method: "POST", body: { text } });
  await refresh();
}

async function regenerateDraft(id) {
  await api(`/api/drafts/${id}/regenerate`, { method: "POST" });
  await refresh();
}

async function cloneDraft(id) {
  await api(`/api/drafts/${id}/clone`, { method: "POST" });
  await refresh();
}

function pendingDrafts() {
  return state.drafts.filter((draft) => ["needs_review", "auto_ready", "approved"].includes(draft.status)).length;
}

function filterItems(items, getter) {
  if (!query) return items;
  return items.filter((item) => getter(item).toLowerCase().includes(query));
}

function statusLabel(status) {
  const labels = {
    auto_ready: "Pronto",
    needs_review: "Revisao",
    approved: "Aprovado",
    published: "Publicado",
    archived: "Arquivado",
    rejected: "Rejeitado",
    failed: "Falhou",
    blocked: "Bloqueado"
  };
  return labels[status] || status;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

document.getElementById("searchInput").addEventListener("input", (event) => {
  query = event.target.value.trim().toLowerCase();
  renderDrafts();
  renderOffers();
});

document.getElementById("scrapeBtn").addEventListener("click", async () => {
  await api("/api/run/scrape", { method: "POST" });
  await refresh();
});

document.getElementById("publishBtn").addEventListener("click", async () => {
  await api("/api/run/publish", { method: "POST" });
  await refresh();
});

document.getElementById("reportBtn").addEventListener("click", async () => {
  await api("/api/run/report", { method: "POST" });
  await refresh();
});

document.getElementById("modeSelect").addEventListener("change", async (event) => {
  await api("/api/settings", { method: "POST", body: { mode: event.target.value } });
  await refresh();
});

refresh().catch((error) => {
  document.body.insertAdjacentHTML("afterbegin", `<pre>${escapeHtml(error.message)}</pre>`);
});
