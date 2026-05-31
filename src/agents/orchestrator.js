import Anthropic from "@anthropic-ai/sdk";
import { scrapeDeals } from "../scrapers.js";
import { validateDeal } from "./validation.js";
import { createContent } from "./creative.js";
import { publishTelegram } from "../publishers/telegram.js";
import { publishDiscord } from "../publishers/discord.js";
import { publishDiscordDeal } from "../discord/deals.js";
import { buildAffiliateUrl } from "../links.js";
import { hasRealPromotion } from "../deals.js";
import { offerIdentityKeys, offerFamilyKey } from "../publication-dedupe.js";
import { telegramPublicationStatus } from "../publication-policy.js";
import { reportAgentEvent } from "../discord/reporter.js";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const PENDING_STATUSES = ["new", "queued", "validated", "auto_ready"];

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runOrchestratorCycle(db, config, options = {}) {
  if (db.load) await db.load();
  const now = options.now || new Date();

  // Deterministic, no-LLM pre-step: refresh candidate offers so the cheap gate
  // and the agent both see fresh deals. Best-effort — never blocks the cycle.
  const scraped = options.skipScrape ? { inserted: 0 } : await safeScrape(db, config);

  const cadence = telegramPublicationStatus(db.state.publishLog || [], config, now);
  const stale = isTelegramStale(db.state.publishLog || [], config, now);
  const pending = (db.state.offers || []).filter((o) => PENDING_STATUSES.includes(o.status));

  // Cost gate: only pay for the agent loop when there is something productive to
  // do. Nothing pending and channel not stale → nothing to decide.
  if (!stale && (pending.length === 0 || !cadence.allowed)) {
    return { ok: true, skipped: true, reason: pending.length === 0 ? "no_pending_offers" : "cadence_blocked", scraped: scraped.inserted, steps: 0 };
  }

  if (!config.anthropicApiKey) {
    return { ok: false, skipped: true, reason: "no_anthropic_api_key", scraped: scraped.inserted, steps: 0 };
  }

  const client = options.client || new Anthropic({ apiKey: config.anthropicApiKey });
  const ctx = { db, config, now, actions: [], published: 0 };

  const result = await runAgentLoop(client, ctx, {
    model: config.orchestratorModel || DEFAULT_MODEL,
    maxSteps: Number(config.orchestratorMaxSteps || 24)
  });

  await db.save();
  await safeReport(db, config, {
    agent: "supervisor",
    title: "Ciclo do orquestrador",
    message: result.summary || "Ciclo concluído.",
    data: { publicados: ctx.published, passos: result.steps, scrape: scraped.inserted }
  });

  return { ok: true, skipped: false, published: ctx.published, steps: result.steps, actions: ctx.actions, scraped: scraped.inserted, summary: result.summary };
}

// ---------------------------------------------------------------------------
// Agent loop (Claude tool-use)
// ---------------------------------------------------------------------------

async function runAgentLoop(client, ctx, { model, maxSteps }) {
  const messages = [{ role: "user", content: buildInitialPrompt(ctx) }];
  let steps = 0;
  let summary = "";

  while (steps < maxSteps) {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages
    });
    messages.push({ role: "assistant", content: response.content });

    const toolUses = (response.content || []).filter((block) => block.type === "tool_use");
    const text = (response.content || []).filter((block) => block.type === "text").map((b) => b.text).join(" ").trim();
    if (text) summary = text;

    if (toolUses.length === 0) {
      // Model narrated instead of acting and may have been cut off — nudge it to use tools.
      if (response.stop_reason === "max_tokens") {
        messages.push({ role: "user", content: "Pare de escrever planos. Chame as ferramentas agora (ou finish_cycle)." });
        steps += 1;
        continue;
      }
      break; // natural stop (end_turn/stop_sequence) with no tools → done
    }

    const toolResults = [];
    for (const toolUse of toolUses) {
      const output = await executeTool(toolUse.name, toolUse.input || {}, ctx);
      ctx.actions.push({ tool: toolUse.name, input: toolUse.input, output });
      toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(output) });
      if (toolUse.name === "finish_cycle") {
        return { steps, summary: toolUse.input?.summary || summary };
      }
    }
    messages.push({ role: "user", content: toolResults });
    steps += 1;
  }

  return { steps, summary };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Você é o ÚNICO operador autônomo do TDO Links, um canal brasileiro de ofertas de tecnologia no Telegram (e Discord/X secundários). A cada ciclo você decide, sozinho, o que publicar.

OBJETIVO: manter o canal vivo com 1 a 4 ofertas premium por hora, de qualidade, SEM duplicatas e SEM deixar o canal mudo.

REGRAS DE DECISÃO:
- Só publique ofertas com promoção real (preço anterior > preço atual) e com imagem.
- NUNCA publique duas vezes a mesma oferta nem variantes da mesma família já publicada recentemente. Se uma ferramenta disser "duplicate" ou "already_published", NÃO insista: arquive a oferta com archive_offer e siga para a próxima.
- Respeite a cadência. Se publish_offer responder "cadence_blocked", pare de tentar publicar neste ciclo — a janela ainda não abriu.
- Valide ofertas novas (status new/queued) antes de publicar. Ofertas já "validated"/"auto_ready" podem ir direto para publish_offer.
- Limpe a base: arquive duplicatas, ofertas sem promoção real e ofertas velhas que nunca vão publicar. Isso é o que impede o canal de travar.

ESTILO: AJA com as ferramentas — NÃO escreva planos longos. No máximo uma frase curta antes de chamar uma ferramenta. Emita as chamadas de ferramenta diretamente (você pode chamar várias de uma vez). Faça só o necessário e encerre com finish_cycle resumindo o que fez. Não peça confirmação a ninguém — você é autônomo.`;

function buildInitialPrompt(ctx) {
  const { db, config, now } = ctx;
  const cadence = telegramPublicationStatus(db.state.publishLog || [], config, now);
  const recentPosts = (db.state.publishLog || [])
    .filter((e) => e.channel === "telegram" && e.result?.ok === true && e.offerId)
    .slice(0, 8)
    .map((e) => {
      const offer = (db.state.offers || []).find((o) => o.id === e.offerId);
      return { title: offer?.title?.slice(0, 60) || e.offerId, at: e.createdAt };
    });
  const pending = (db.state.offers || [])
    .filter((o) => PENDING_STATUSES.includes(o.status))
    .slice(0, 30)
    .map((o) => summarizeOffer(o, db));

  return JSON.stringify({
    instruction: "Rode um ciclo. Decida o que validar, publicar e arquivar. Encerre com finish_cycle.",
    agora: now.toISOString(),
    cadencia: {
      pode_publicar_agora: cadence.allowed,
      motivo: cadence.reason,
      publicados_na_janela: cadence.recentPublished,
      max_por_janela: cadence.maxPerCycle,
      espera_minutos: cadence.waitMinutes
    },
    posts_recentes: recentPosts,
    ofertas_pendentes: pending
  });
}

function summarizeOffer(offer, db) {
  return {
    id: offer.id,
    titulo: (offer.title || "").slice(0, 80),
    status: offer.status,
    preco_atual: offer.currentPrice ?? null,
    preco_anterior: offer.previousPrice ?? null,
    promocao_real: hasRealPromotion(offer),
    tem_imagem: hasProductImage(offer),
    ja_publicada: wasAlreadyPublished(db.state, offer.id, "telegram"),
    familia_publicada_recente: familyRecentlyPublished(db.state, offer, "telegram", 24, new Date()),
    idade_horas: ageHours(offer)
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "scrape_deals",
    description: "Busca novas ofertas (Amazon) e insere as inéditas na base como 'new'. Use se precisar de mais candidatos.",
    input_schema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "validate_offer",
    description: "Valida uma oferta com o curador IA. Atualiza o status para 'auto_ready' (aprovada) ou 'rejected'. Retorna o veredito.",
    input_schema: {
      type: "object",
      properties: { offerId: { type: "string" } },
      required: ["offerId"],
      additionalProperties: false
    }
  },
  {
    name: "publish_offer",
    description: "Gera copy + imagem e publica a oferta no Telegram (e Discord/X). Idempotente: retorna 'already_published', 'duplicate', 'cadence_blocked' ou 'no_promotion' sem postar quando aplicável. Só conta como publicado se published=true.",
    input_schema: {
      type: "object",
      properties: { offerId: { type: "string" } },
      required: ["offerId"],
      additionalProperties: false
    }
  },
  {
    name: "archive_offer",
    description: "Arquiva uma oferta (status 'archived') para tirá-la do funil. Use em duplicatas, ofertas sem promoção real ou velhas demais.",
    input_schema: {
      type: "object",
      properties: { offerId: { type: "string" }, reason: { type: "string" } },
      required: ["offerId"],
      additionalProperties: false
    }
  },
  {
    name: "finish_cycle",
    description: "Encerra o ciclo. Forneça um resumo curto do que foi feito.",
    input_schema: {
      type: "object",
      properties: { summary: { type: "string" } },
      additionalProperties: false
    }
  }
];

async function executeTool(name, input, ctx) {
  try {
    switch (name) {
      case "scrape_deals": return await toolScrape(ctx);
      case "validate_offer": return await toolValidate(ctx, input.offerId);
      case "publish_offer": return await toolPublish(ctx, input.offerId);
      case "archive_offer": return toolArchive(ctx, input.offerId, input.reason);
      case "finish_cycle": return { ok: true };
      default: return { ok: false, error: `unknown_tool:${name}` };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Tool implementations (exported for testing)
// ---------------------------------------------------------------------------

export async function toolScrape(ctx) {
  const { db, config } = ctx;
  const result = await safeScrape(db, config);
  return { ok: true, inserted: result.inserted, offers: result.offers };
}

export async function toolValidate(ctx, offerId) {
  const { db, config } = ctx;
  const offer = findOffer(db, offerId);
  if (!offer) return { ok: false, error: "offer_not_found" };

  const verdict = await validateDeal(offer, config);
  const threshold = config.aiConfidenceThreshold ?? 70;
  const passes = verdict.valid === true && verdict.confidence >= threshold && hasRealPromotion(offer);

  offer.status = passes ? "auto_ready" : "rejected";
  offer.validationSummary = passes ? verdict.reason : (hasRealPromotion(offer) ? verdict.reason : "missing_real_promotion");
  offer.validationConfidence = verdict.confidence;
  offer.updatedAt = new Date().toISOString();
  await db.save();

  return { ok: true, offerId, approved: passes, confidence: verdict.confidence, reason: offer.validationSummary, status: offer.status };
}

export async function toolPublish(ctx, offerId) {
  const { db, config, now } = ctx;
  const offer = findOffer(db, offerId);
  if (!offer) return { ok: false, error: "offer_not_found" };

  if (!hasRealPromotion(offer)) return { ok: true, published: false, reason: "no_promotion" };
  if (wasAlreadyPublished(db.state, offer.id, "telegram")) return { ok: true, published: false, reason: "already_published" };
  if (familyRecentlyPublished(db.state, offer, "telegram", config.relatedOfferDedupeHours ?? 24, now)) {
    return { ok: true, published: false, reason: "duplicate" };
  }
  const cadence = telegramPublicationStatus(db.state.publishLog || [], config, now);
  if (!cadence.allowed) return { ok: true, published: false, reason: "cadence_blocked", waitMinutes: cadence.waitMinutes };

  // Build copy + image
  const content = await createContent(offer, { reason: offer.validationSummary || "Oferta selecionada" }, config);
  if (content.imageUrls?.length) {
    offer.officialImageUrls = content.imageUrls;
    offer.imageStatus = "done";
  }
  let affiliateUrl;
  try { affiliateUrl = buildAffiliateUrl(offer, config, "telegram"); }
  catch { affiliateUrl = offer.affiliateUrl || offer.originalUrl || offer.url || ""; }

  const telegramText = resolveCopy(content.copy.telegram, affiliateUrl);
  const result = await publishTelegram({ text: telegramText }, config, offer);
  savePublishResult(db, offer.id, "telegram", result);

  if (result.ok) {
    offer.status = "published";
    offer.publishedAt = new Date().toISOString();
    ctx.published += 1;
    // Best-effort secondary channels
    await publishSecondary(ctx, offer, content, affiliateUrl);
  } else {
    offer.status = result.detail === "telegram_photo_required" ? "rejected" : "failed";
    offer.validationSummary = result.detail;
  }
  offer.updatedAt = new Date().toISOString();
  await db.save();

  await safeReport(db, config, {
    agent: "publisher",
    severity: result.ok ? "info" : "warning",
    title: result.ok ? "Telegram publicado" : "Falha no Telegram",
    message: result.ok ? offer.title?.slice(0, 80) : (result.detail || "falha"),
    data: { offerId: offer.id, detail: result.detail || "", dryRun: result.dryRun || false }
  });

  return { ok: true, published: result.ok, reason: result.ok ? "published" : (result.detail || "publish_failed"), dryRun: result.dryRun || false };
}

export function toolArchive(ctx, offerId, reason) {
  const { db } = ctx;
  const offer = findOffer(db, offerId);
  if (!offer) return { ok: false, error: "offer_not_found" };
  offer.status = "archived";
  offer.archiveReason = reason || "archived_by_orchestrator";
  offer.updatedAt = new Date().toISOString();
  return { ok: true, offerId, status: "archived", reason: offer.archiveReason };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function publishSecondary(ctx, offer, content, affiliateUrl) {
  const { db, config } = ctx;
  if (!wasAlreadyPublished(db.state, offer.id, "discord")) {
    try {
      const draft = { text: resolveCopy(content.copy.discord, affiliateUrl) };
      const offerForDiscord = { ...offer, affiliateUrl };
      const result = await publishDiscord(draft, config, offerForDiscord);
      savePublishResult(db, offer.id, "discord", result);
      if (result.ok) await publishDiscordDeal(db, config, offerForDiscord).catch(() => {});
    } catch { /* secondary channel is best-effort */ }
  }
}

async function safeScrape(db, config) {
  try {
    const raw = await scrapeDeals(config);
    const inserted = [];
    for (const offer of raw) {
      if (isAlreadyKnown(db.state, offer)) continue;
      const queued = {
        id: db.nextId ? db.nextId("offer") : `offer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ...offer,
        status: "new",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.state.offers.unshift(queued);
      inserted.push({ id: queued.id, titulo: (queued.title || "").slice(0, 60) });
    }
    if (inserted.length) await db.save();
    return { inserted: inserted.length, offers: inserted };
  } catch (err) {
    console.log("orchestrator_scrape_error", JSON.stringify({ error: err.message }));
    return { inserted: 0, offers: [], error: err.message };
  }
}

function isAlreadyKnown(state, offer) {
  const keys = new Set(offerIdentityKeys(offer));
  if (!keys.size) return false;
  return (state.offers || []).some((existing) => offerIdentityKeys(existing).some((k) => keys.has(k)));
}

function findOffer(db, offerId) {
  return (db.state.offers || []).find((o) => o.id === offerId) || null;
}

function resolveCopy(template, affiliateUrl) {
  return (template || "").replace(/\{LINK\}/g, affiliateUrl || "");
}

function savePublishResult(db, offerId, channel, result) {
  if (!db.state.publishLog) db.state.publishLog = [];
  db.state.publishLog.unshift({
    id: db.nextId ? db.nextId("pub") : `pub_${Date.now()}_${channel}`,
    offerId,
    channel,
    result,
    createdAt: new Date().toISOString()
  });
}

function wasAlreadyPublished(state, offerId, channel) {
  return (state.publishLog || []).some((e) => e.offerId === offerId && e.channel === channel && e.result?.ok === true);
}

function familyRecentlyPublished(state, offer, channel, hours, now) {
  const key = offerFamilyKey(offer);
  if (!key) return false;
  const cutoff = new Date(now.getTime() - Number(hours || 24) * 60 * 60 * 1000);
  const offersById = new Map((state.offers || []).map((o) => [o.id, o]));
  return (state.publishLog || []).some((e) => {
    if (e.channel !== channel || e.result?.ok !== true || !e.offerId) return false;
    if (new Date(e.createdAt) < cutoff) return false;
    return offerFamilyKey(offersById.get(e.offerId)) === key;
  });
}

function hasProductImage(offer) {
  return Boolean(offer?.telegramImageFileId || offer?.imageUrl || offer?.imageUrls?.length || offer?.officialImageUrls?.length);
}

function ageHours(offer) {
  const t = new Date(offer.createdAt || offer.updatedAt || Date.now()).getTime();
  return Math.round((Date.now() - t) / 3_600_000);
}

function isTelegramStale(publishLog, config, now) {
  const minutes = Number(config.supervisorStaleTelegramMinutes || 90);
  const lastOk = (publishLog || [])
    .filter((e) => e.channel === "telegram" && e.result?.ok === true)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (!lastOk) return true;
  return now.getTime() - new Date(lastOk.createdAt).getTime() >= minutes * 60 * 1000;
}

async function safeReport(db, config, event) {
  try { await reportAgentEvent(db, config, event); } catch { /* telemetry is best-effort */ }
}
