import { Queue } from "bullmq";
import Redis from "ioredis";

let connection = null;
export let scrapeQueue = null;
export let imagegenQueue = null;
export let publishQueue = null;
export let validationQueue = null;
export let creativeQueue = null;

export function initQueues(redisUrl) {
  if (!redisUrl) return false;
  connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const opts = { connection };
  scrapeQueue = new Queue("scrape", opts);
  imagegenQueue = new Queue("imagegen", opts);
  publishQueue = new Queue("publish", opts);
  validationQueue = new Queue("validation", opts);
  creativeQueue = new Queue("creative", opts);
  console.log("queues_initialized", JSON.stringify({ redis: redisUrl.replace(/:\/\/.*@/, "://***@") }));
  return true;
}

export function getConnection() {
  return connection;
}
