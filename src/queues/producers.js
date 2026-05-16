import { imagegenQueue, publishQueue, scrapeQueue } from "./index.js";
import { runScrapePipeline, runPublishPipeline } from "../agents.js";
import { generateOfferImage } from "../imagegen.js";

export async function enqueueScrape(db, config, trigger = "manual") {
  if (scrapeQueue) {
    await scrapeQueue.add("scrape", { trigger }, {
      attempts: 2, backoff: { type: "exponential", delay: 60000 }
    });
    return { title: "Busca iniciada", detail: "Ofertas aparecem em segundos", tone: "success" };
  }
  const result = await runScrapePipeline(db, config);
  return { title: `${result.inserted} oferta(s) encontrada(s)`, tone: result.inserted > 0 ? "success" : "warning" };
}

export async function enqueueImagegen(db, config, offerId) {
  if (imagegenQueue) {
    await imagegenQueue.add("imagegen", { offerId }, {
      attempts: 3, backoff: { type: "exponential", delay: 30000 }
    });
    return { title: "Imagem sendo gerada", detail: "Aparece em alguns segundos", tone: "success" };
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
    return { title: "Publicação iniciada", detail: "Posts enviados em background", tone: "success" };
  }
  return runPublishPipeline(db, config);
}
