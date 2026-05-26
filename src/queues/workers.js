import { Worker } from "bullmq";
import { generateOfferImagePack } from "../imagegen.js";
import { saveOfferImages } from "../pg-db.js";
import { validateDeal } from "../agents/validation.js";
import { createContent } from "../agents/creative.js";
import { publishDeal } from "../agents/publisher.js";
import { creativeQueue, publishQueue } from "./index.js";

export function startWorkers(db, config, connection) {
  const opts = { connection, concurrency: 1 };

  // Legacy scrape worker — drains old queued jobs without running the old pipeline
  const scrapeWorker = new Worker("scrape", async (job) => {
    console.log("job_done", JSON.stringify({ queue: "scrape", result: "skipped_legacy" }));
    return { skipped: true };
  }, opts);

  const imagegenWorker = new Worker("imagegen", async (job) => {
    const { offerId } = job.data;
    console.log("job_start", JSON.stringify({ queue: "imagegen", offerId }));
    const offerIndex = db.state.offers.findIndex(o => o.id === offerId);
    if (offerIndex === -1) throw new Error(`offer_not_found: ${offerId}`);

    db.state.offers[offerIndex].imageStatus = "generating";
    db.state.offers[offerIndex].imageStatusUpdatedAt = new Date().toISOString();
    await db.save();

    let paths, buffers;
    try {
      ({ paths, buffers } = await generateOfferImagePack(db.state.offers[offerIndex], config));
    } catch (err) {
      db.state.offers[offerIndex].imageStatus = "failed";
      db.state.offers[offerIndex].imageStatusUpdatedAt = new Date().toISOString();
      await db.save();
      throw err;
    }

    // Save to Postgres — primary storage, survives container redeploys
    if (db.pool) {
      await saveOfferImages(db.pool, offerId, buffers);
      console.log("imagegen_pg_saved", JSON.stringify({ offerId, count: buffers.length }));
    }

    db.state.offers[offerIndex].generatedImagePaths = paths;
    db.state.offers[offerIndex].generatedImagePath = paths[0];
    db.state.offers[offerIndex].generatedAt = new Date().toISOString();
    db.state.offers[offerIndex].imageStatus = "done";
    db.state.offers[offerIndex].imageStatusUpdatedAt = new Date().toISOString();
    await db.save();
    console.log("job_done", JSON.stringify({ queue: "imagegen", offerId, imagePath: paths[0] }));
    return { imagePath: paths[0] };
  }, { ...opts, concurrency: 2 });

  const publishWorker = new Worker("publish", async (job) => {
    // Agent pipeline publish (new): job has { offer, content }
    if (job.data.offer && job.data.content) {
      const { offer, content } = job.data;
      console.log("job_start", JSON.stringify({ queue: "publish", offerId: offer.id, mode: "agent" }));
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
    const { offer } = job.data;
    console.log("job_start", JSON.stringify({ queue: "validation", title: offer?.title }));

    const validationResult = await validateDeal(offer, config);
    const threshold = config.aiConfidenceThreshold ?? 70;
    const passes = validationResult.valid === true && validationResult.confidence > threshold;

    if (!passes) {
      // Save rejected offer to DB so it appears in the Rejected view
      const canonicalUrl = (offer.originalUrl || offer.url || "").split("?")[0];
      const alreadyInDb = db.state.offers.some(o =>
        (offer.asin && o.asin === offer.asin) ||
        ((o.originalUrl || o.url || "").split("?")[0] === canonicalUrl && canonicalUrl)
      );
      if (!alreadyInDb) {
        const id = db.nextId("offer");
        db.state.offers.unshift({
          id, ...offer, status: "rejected",
          validationSummary: validationResult.reason,
          validationConfidence: validationResult.confidence,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
        await db.save();
      }
      console.log("job_done", JSON.stringify({
        queue: "validation", title: offer?.title, result: "rejected",
        confidence: validationResult.confidence, reason: validationResult.reason
      }));
      return { ...validationResult, passes };
    }

    // Quota check: max N publications per window before enqueuing creative
    const maxPerCycle = config.maxPublicationsPerCycle ?? 2;
    const windowHours = config.publicationWindowHours ?? 2;
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const recentPublished = (db.state.publishLog || [])
      .filter(l => l.result?.ok && l.channel === "telegram" && l.createdAt >= windowStart)
      .length;

    if (recentPublished >= maxPerCycle) {
      console.log("job_done", JSON.stringify({
        queue: "validation", title: offer?.title, result: "quota_reached",
        recentPublished, maxPerCycle, windowHours
      }));
      return { ...validationResult, passes: false, reason: "quota_reached" };
    }

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

    if (creativeQueue) {
      await creativeQueue.add("creative", { offer: offerWithId, validationResult }, {
        attempts: 3, backoff: { type: "exponential", delay: 30000 }
      });
      console.log("job_done", JSON.stringify({
        queue: "validation", title: offer?.title, result: "enqueued_creative",
        offerId: offerWithId.id, confidence: validationResult.confidence,
        recentPublished, maxPerCycle
      }));
    }

    return { ...validationResult, passes };
  }, opts);

  // New: Creative worker
  const creativeWorker = new Worker("creative", async (job) => {
    const { offer, validationResult } = job.data;
    console.log("job_start", JSON.stringify({ queue: "creative", title: offer?.title }));

    // Second quota gate — prevents backlogged creative jobs from all publishing at once
    const maxPerCycle = config.maxPublicationsPerCycle ?? 2;
    const windowHours = config.publicationWindowHours ?? 2;
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const recentPublished = (db.state.publishLog || [])
      .filter(l => l.result?.ok && l.channel === "telegram" && l.createdAt >= windowStart)
      .length;
    if (recentPublished >= maxPerCycle) {
      console.log("job_done", JSON.stringify({ queue: "creative", title: offer?.title, result: "quota_reached_at_creative", recentPublished, maxPerCycle }));
      return { skipped: true, reason: "quota_reached" };
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
    } else {
      console.log("job_done", JSON.stringify({ queue: "creative", title: offer?.title, result: "no_publish_queue" }));
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
  return allWorkers;
}
