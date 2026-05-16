import { Worker } from "bullmq";
import { runScrapePipeline, runPublishPipeline } from "../agents.js";
import { generateOfferImage } from "../imagegen.js";
import { validateDeal } from "../agents/validation.js";
import { createContent } from "../agents/creative.js";
import { publishDeal } from "../agents/publisher.js";
import { creativeQueue, publishQueue } from "./index.js";

export function startWorkers(db, config, connection) {
  const opts = { connection, concurrency: 1 };

  const scrapeWorker = new Worker("scrape", async (job) => {
    console.log("job_start", JSON.stringify({ queue: "scrape", trigger: job.data.trigger }));
    const result = await runScrapePipeline(db, config);
    console.log("job_done", JSON.stringify({ queue: "scrape", ...result }));
    return result;
  }, opts);

  const imagegenWorker = new Worker("imagegen", async (job) => {
    const { offerId } = job.data;
    console.log("job_start", JSON.stringify({ queue: "imagegen", offerId }));
    const offerIndex = db.state.offers.findIndex(o => o.id === offerId);
    if (offerIndex === -1) throw new Error(`offer_not_found: ${offerId}`);
    const imagePath = await generateOfferImage(db.state.offers[offerIndex], config);
    db.state.offers[offerIndex].generatedImagePath = imagePath;
    db.state.offers[offerIndex].generatedAt = new Date().toISOString();
    await db.save();
    console.log("job_done", JSON.stringify({ queue: "imagegen", offerId, imagePath }));
    return { imagePath };
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
    // Legacy publish (existing)
    console.log("job_start", JSON.stringify({ queue: "publish", draftId: job.data.draftId }));
    const result = await runPublishPipeline(db, config);
    console.log("job_done", JSON.stringify({ queue: "publish", ...result }));
    return result;
  }, opts);

  // New: Validation worker
  const validationWorker = new Worker("validation", async (job) => {
    const { offer } = job.data;
    console.log("job_start", JSON.stringify({ queue: "validation", title: offer?.title }));

    const validationResult = await validateDeal(offer, config);
    const threshold = config.aiConfidenceThreshold ?? 70;
    const passes = validationResult.valid === true && validationResult.confidence >= threshold;

    if (passes && creativeQueue) {
      await creativeQueue.add("creative", { offer, validationResult }, {
        attempts: 3,
        backoff: { type: "exponential", delay: 30000 }
      });
      console.log("job_done", JSON.stringify({ queue: "validation", title: offer?.title, result: "enqueued_creative" }));
    } else {
      console.log("job_done", JSON.stringify({
        queue: "validation",
        title: offer?.title,
        result: "rejected",
        confidence: validationResult.confidence,
        reason: validationResult.reason
      }));
    }

    return { ...validationResult, passes };
  }, { ...opts, concurrency: 3 });

  // New: Creative worker
  const creativeWorker = new Worker("creative", async (job) => {
    const { offer, validationResult } = job.data;
    console.log("job_start", JSON.stringify({ queue: "creative", title: offer?.title }));

    const content = await createContent(offer, validationResult, config);

    if (publishQueue) {
      await publishQueue.add("publish", { offer, content }, {
        attempts: 2,
        backoff: { type: "exponential", delay: 10000 }
      });
      console.log("job_done", JSON.stringify({ queue: "creative", title: offer?.title, result: "enqueued_publish" }));
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
