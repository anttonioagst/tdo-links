import { Worker } from "bullmq";
import { runScrapePipeline, runPublishPipeline } from "../agents.js";
import { generateOfferImage } from "../imagegen.js";

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
    console.log("job_start", JSON.stringify({ queue: "publish", draftId: job.data.draftId }));
    const result = await runPublishPipeline(db, config);
    console.log("job_done", JSON.stringify({ queue: "publish", ...result }));
    return result;
  }, opts);

  for (const worker of [scrapeWorker, imagegenWorker, publishWorker]) {
    worker.on("failed", (job, err) => {
      console.error("job_failed", JSON.stringify({ queue: worker.name, jobId: job?.id, error: err.message }));
    });
  }

  console.log("workers_started", JSON.stringify({ queues: ["scrape", "imagegen", "publish"] }));
  return [scrapeWorker, imagegenWorker, publishWorker];
}
