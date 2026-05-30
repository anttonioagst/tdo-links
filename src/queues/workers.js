import { Worker } from "bullmq";
import { validateDeal } from "../agents/validation.js";
import { createContent } from "../agents/creative.js";
import { publishDeal } from "../agents/publisher.js";
import { creativeQueue, publishQueue } from "./index.js";
import { hasRealPromotion } from "../deals.js";
import { telegramPublicationStatus } from "../publication-policy.js";
import { enqueuePendingTelegramOffers } from "../publication-recovery.js";
import { reportAgentEvent } from "../discord/reporter.js";

export function startWorkers(db, config, connection) {
  const opts = { connection, concurrency: 1 };

  // Legacy scrape worker — drains old queued jobs without running the old pipeline
  const scrapeWorker = new Worker("scrape", async (job) => {
    console.log("job_done", JSON.stringify({ queue: "scrape", result: "skipped_legacy" }));
    return { skipped: true };
  }, opts);

  const imagegenWorker = new Worker("imagegen", async (job) => {
    console.log("job_done", JSON.stringify({ queue: "imagegen", result: "skipped_no_longer_used" }));
    return { skipped: true };
  }, opts);

  const publishWorker = new Worker("publish", async (job) => {
    // Agent pipeline publish (new): job has { offer, content }
    if (job.data.offer && job.data.content) {
      const { offer, content } = job.data;
      console.log("job_start", JSON.stringify({ queue: "publish", offerId: offer.id, mode: "agent" }));
      if (db.load) await db.load();
      const publication = telegramPublicationStatus(db.state.publishLog || [], config);
      if (!publication.allowed) {
        const delay = Math.max(1, publication.waitMinutes) * 60 * 1000;
        await publishQueue.add("publish", job.data, {
          delay,
          attempts: 2,
          backoff: { type: "exponential", delay: 10000 }
        });
        console.log("job_done", JSON.stringify({
          queue: "publish",
          offerId: offer.id,
          mode: "agent",
          result: "rescheduled",
          reason: publication.reason,
          waitMinutes: publication.waitMinutes
        }));
        return { skipped: true, rescheduled: true, reason: publication.reason, waitMinutes: publication.waitMinutes };
      }
      const result = await publishDeal(offer, content, config, db);
      console.log("job_done", JSON.stringify({ queue: "publish", offerId: offer.id, mode: "agent" }));
      return result;
    }
    // Legacy publish — drafts manually approved via dashboard
    const { runPublishPipeline } = await import("../agents.js");
    console.log("job_start", JSON.stringify({ queue: "publish", mode: "legacy" }));
    const result = await runPublishPipeline(db, config);
    console.log("job_done", JSON.stringify({ queue: "publish", mode: "legacy", published: result.published }));
    return result;
  }, opts);

  // New: Validation worker
  const validationWorker = new Worker("validation", async (job) => {
    let { offer } = job.data;
    console.log("job_start", JSON.stringify({ queue: "validation", title: offer?.title }));
    await safeReport(db, config, {
      agent: "validation",
      title: "Validação iniciada",
      message: "Produto entrou no filtro de qualidade.",
      data: { titulo: offer?.title || "", asin: offer?.asin || "" }
    });

    // Verify price, rating, and review count from the actual product page.
    // Search listings show cheapest variant price and no review counts in static HTML.
    if (offer?.asin) {
      try {
        const { verifyAmazonProduct } = await import("../scrapers.js");
        const verified = await verifyAmazonProduct(offer.asin, config);
        const updates = { priceVerifiedAt: new Date().toISOString() };
        if (verified.currentPrice && verified.currentPrice > 0) {
          const scrapedPrice = offer.currentPrice;
          updates.currentPrice = verified.currentPrice;
          if (verified.currentPrice !== scrapedPrice) {
            const pctDiff = scrapedPrice ? Math.round(((verified.currentPrice - scrapedPrice) / scrapedPrice) * 100) : null;
            console.log("job_event", JSON.stringify({
              queue: "validation", event: "price_corrected", asin: offer.asin,
              scrapedPrice, verifiedPrice: verified.currentPrice, pctDiff
            }));
          }
        }
        // Enrich with product page rating/reviews when search HTML doesn't have them
        if (verified.rating && (!offer.rating || offer.rating === 0)) updates.rating = verified.rating;
        if (verified.reviewCount && (!offer.reviewCount || offer.reviewCount === 0)) updates.reviewCount = verified.reviewCount;
        if (verified.imageUrls?.length) {
          updates.imageUrl = verified.imageUrl;
          updates.imageUrls = verified.imageUrls;
          updates.productPageImageVerifiedAt = new Date().toISOString();
        }
        offer = { ...offer, ...updates };
      } catch (err) {
        console.log("job_event", JSON.stringify({ queue: "validation", event: "price_verify_error", asin: offer.asin, error: err.message }));
      }
    }

    const validationResult = await validateDeal(offer, config);
    const threshold = config.aiConfidenceThreshold ?? 70;
    const passes = validationResult.valid === true && validationResult.confidence >= threshold;
    const promotionReady = hasRealPromotion(offer);

    if (!passes || !promotionReady) {
      // Save rejected offer to DB so it appears in the Rejected view
      const canonicalUrl = (offer.originalUrl || offer.url || "").split("?")[0];
      const existingIndex = db.state.offers.findIndex(o =>
        (offer.asin && o.asin === offer.asin) ||
        ((o.originalUrl || o.url || "").split("?")[0] === canonicalUrl && canonicalUrl)
      );
      const rejectionReason = promotionReady ? validationResult.reason : "missing_real_promotion";
      if (existingIndex === -1) {
        const id = db.nextId("offer");
        db.state.offers.unshift({
          id, ...offer, status: "rejected",
          validationSummary: rejectionReason,
          validationConfidence: validationResult.confidence,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
      } else {
        db.state.offers[existingIndex] = {
          ...db.state.offers[existingIndex],
          ...offer,
          status: "rejected",
          validationSummary: rejectionReason,
          validationConfidence: validationResult.confidence,
          updatedAt: new Date().toISOString()
        };
      }
      await db.save();
      await safeReport(db, config, {
        agent: "validation",
        severity: "warning",
        title: "Produto rejeitado",
        message: "O produto não passou no filtro de promoção/qualidade.",
        data: {
          offerId: db.state.offers[existingIndex === -1 ? 0 : existingIndex]?.id || offer.id || "",
          motivo: rejectionReason,
          confianca: validationResult.confidence
        }
      });
      console.log("job_done", JSON.stringify({
        queue: "validation", title: offer?.title, result: "rejected",
        confidence: validationResult.confidence, reason: rejectionReason
      }));
      return { ...validationResult, passes: false, reason: rejectionReason };
    }

    // Quota check: max N publications per window before enqueuing creative
    const publication = telegramPublicationStatus(db.state.publishLog || [], config);

    // Insert validated offer to DB so the UI shows image generation progress
    const canonicalUrl = (offer.originalUrl || offer.url || "").split("?")[0];
    let offerWithId = db.state.offers.find(o =>
      (offer.asin && o.asin === offer.asin) ||
      ((o.originalUrl || o.url || "").split("?")[0] === canonicalUrl && canonicalUrl)
    );
    if (!offerWithId) {
      const id = db.nextId("offer");
      offerWithId = {
        id, ...offer, status: "validated",
        validationSummary: validationResult.reason,
        validationConfidence: validationResult.confidence,
        imageStatus: "pending",
        imageStatusUpdatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      db.state.offers.unshift(offerWithId);
      await db.save();
    }

    if (!publication.allowed) {
      const delay = Math.max(1, publication.waitMinutes) * 60 * 1000;
      if (creativeQueue) {
        await creativeQueue.add("creative", { offer: offerWithId, validationResult }, {
          delay,
          attempts: 3,
          backoff: { type: "exponential", delay: 30000 },
          jobId: `delayed_creative_${offerWithId.id}`
        });
      }
      console.log("job_done", JSON.stringify({
        queue: "validation", title: offer?.title, result: "delayed_creative",
        reason: publication.reason,
        offerId: offerWithId.id,
        waitMinutes: publication.waitMinutes
      }));
      await safeReport(db, config, {
        agent: "validation",
        severity: "warning",
        title: "Produto aguardando janela",
        message: "Produto aprovado, mas a publicação foi adiada pela cadência.",
        data: { offerId: offerWithId.id, motivo: publication.reason, esperaMin: publication.waitMinutes }
      });
      return { ...validationResult, passes, delayed: true, reason: publication.reason };
    }

    if (creativeQueue) {
      await creativeQueue.add("creative", { offer: offerWithId, validationResult }, {
        attempts: 3, backoff: { type: "exponential", delay: 30000 }
      });
      console.log("job_done", JSON.stringify({
        queue: "validation", title: offer?.title, result: "enqueued_creative",
        offerId: offerWithId.id, confidence: validationResult.confidence,
        recentPublished: publication.recentPublished,
        maxPerCycle: publication.maxPerCycle
      }));
      await safeReport(db, config, {
        agent: "validation",
        title: "Produto aprovado",
        message: "Produto passou no filtro e foi enviado para copy/imagem.",
        data: { offerId: offerWithId.id, confianca: validationResult.confidence }
      });
    }

    return { ...validationResult, passes };
  }, opts);

  // New: Creative worker
  const creativeWorker = new Worker("creative", async (job) => {
    const { offer, validationResult } = job.data;
    console.log("job_start", JSON.stringify({ queue: "creative", title: offer?.title }));
    await safeReport(db, config, {
      agent: "creative",
      title: "Copy iniciada",
      message: "Agente criativo começou a montar copy e imagem.",
      data: { offerId: offer?.id || "", titulo: offer?.title || "" }
    });

    // Second quota gate — prevents backlogged creative jobs from all publishing at once
    const publication = telegramPublicationStatus(db.state.publishLog || [], config);
    if (!publication.allowed) {
      const delay = Math.max(1, publication.waitMinutes) * 60 * 1000;
      if (creativeQueue) {
        await creativeQueue.add("creative", job.data, {
          delay,
          attempts: 3,
          backoff: { type: "exponential", delay: 30000 },
          jobId: `delayed_creative_${offer.id}`
        });
      }
      console.log("job_done", JSON.stringify({
        queue: "creative",
        title: offer?.title,
        result: "rescheduled",
        reason: publication.reason,
        recentPublished: publication.recentPublished,
        maxPerCycle: publication.maxPerCycle,
        waitMinutes: publication.waitMinutes
      }));
      await safeReport(db, config, {
        agent: "creative",
        severity: "warning",
        title: "Copy reagendada",
        message: "O produto continua aprovado, mas vai aguardar a próxima janela.",
        data: { offerId: offer.id, motivo: publication.reason, esperaMin: publication.waitMinutes }
      });
      return { skipped: true, rescheduled: true, reason: publication.reason, waitMinutes: publication.waitMinutes };
    }

    const content = await createContent(offer, validationResult, config);

    // Persist official image URLs back to the offer in DB
    const offerInDb = db.state.offers.find(o => o.id === offer.id);
    if (offerInDb) {
      if (content.imageUrls?.length) {
        offerInDb.officialImageUrls = content.imageUrls;
        offerInDb.imageStatus = "done";
      } else {
        offerInDb.imageStatus = "failed";
      }
      offerInDb.imageStatusUpdatedAt = new Date().toISOString();
      offerInDb.status = "auto_ready";
      offerInDb.updatedAt = new Date().toISOString();
      await db.save();
    }

    if (publishQueue) {
      await publishQueue.add("publish", { offer: offerInDb || offer, content }, {
        attempts: 2, backoff: { type: "exponential", delay: 10000 }
      });
      console.log("job_done", JSON.stringify({ queue: "creative", title: offer?.title, result: "enqueued_publish", imageCount: content.imagePaths?.length ?? (content.imagePath ? 1 : 0) }));
      await safeReport(db, config, {
        agent: "creative",
        title: "Copy pronta",
        message: "Copy e imagem foram preparadas e enviadas para publicação.",
        data: {
          offerId: offer.id,
          imagem: content.imageUrls?.length ? "ok" : "sem_imagem",
          imagens: content.imageUrls?.length || 0
        }
      });
      await safeReport(db, config, {
        agent: "image",
        title: content.imageUrls?.length ? "Imagem pronta" : "Imagem ausente",
        severity: content.imageUrls?.length ? "info" : "warning",
        message: content.imageUrls?.length
          ? "Imagem oficial em boa qualidade foi anexada ao produto."
          : "Produto seguiu sem imagem oficial aprovada.",
        data: { offerId: offer.id, imagens: content.imageUrls?.length || 0 }
      });
    } else {
      console.log("job_done", JSON.stringify({ queue: "creative", title: offer?.title, result: "no_publish_queue" }));
      await safeReport(db, config, {
        agent: "creative",
        severity: "warning",
        title: "Fila de publicação ausente",
        message: "Copy foi criada, mas não havia fila de publicação disponível.",
        data: { offerId: offer.id }
      });
    }

    return { hasImage: !!content.imagePath };
  }, { ...opts, concurrency: 2 });

  const allWorkers = [scrapeWorker, imagegenWorker, publishWorker, validationWorker, creativeWorker];

  for (const worker of allWorkers) {
    worker.on("failed", (job, err) => {
      console.error("job_failed", JSON.stringify({ queue: worker.name, jobId: job?.id, error: err.message }));
    });
  }

  console.log("workers_started", JSON.stringify({ queues: ["scrape", "imagegen", "publish", "validation", "creative"] }));

  setInterval(() => {
    enqueuePendingTelegramOffers(db, config, creativeQueue)
      .then((result) => {
        if (result.enqueued || result.reason !== "ok") {
          console.log("publication_recovery", JSON.stringify(result));
        }
      })
      .catch((err) => console.error("publication_recovery_failed", JSON.stringify({ error: err.message })));
  }, 5 * 60 * 1000);

  enqueuePendingTelegramOffers(db, config, creativeQueue)
    .then((result) => console.log("publication_recovery_startup", JSON.stringify(result)))
    .catch((err) => console.error("publication_recovery_startup_failed", JSON.stringify({ error: err.message })));

  return allWorkers;
}

async function safeReport(db, config, event) {
  try {
    await reportAgentEvent(db, config, event);
  } catch {
    // Discord telemetry is best-effort and must not stop queue workers.
  }
}
