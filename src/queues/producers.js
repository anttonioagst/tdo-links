import { imagegenQueue, publishQueue, scrapeQueue } from "./index.js";
import { runScrapePipeline, runPublishPipeline } from "../agents.js";
import { generateOfferImage } from "../imagegen.js";

export async function enqueueScrape(db, config, trigger = "manual") {
  if (scrapeQueue) {
    await scrapeQueue.add("scrape", { trigger }, {
      attempts: 2, backoff: { type: "exponential", delay: 60000 }
    });
    return { queued: true, trigger };
  }
  return runScrapePipeline(db, config);
}

export async function enqueueImagegen(db, config, offerId) {
  if (imagegenQueue) {
    await imagegenQueue.add("imagegen", { offerId }, {
      attempts: 3, backoff: { type: "exponential", delay: 30000 }
    });
    return { queued: true, offerId };
  }
  const offer = db.state.offers.find(o => o.id === offerId);
  if (!offer) throw new Error("offer_not_found");
  const imagePath = await generateOfferImage(offer, config);
  offer.generatedImagePath = imagePath;
  offer.generatedAt = new Date().toISOString();
  await db.save();
  return { ok: true, imagePath };
}

export async function enqueuePublish(db, config, draftId, channels) {
  if (publishQueue) {
    await publishQueue.add("publish", { draftId, channels }, {
      attempts: 2, backoff: { type: "exponential", delay: 10000 }
    });
    return { queued: true, draftId };
  }
  return runPublishPipeline(db, config);
}
