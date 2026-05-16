// Single entrypoint — Railway uses WORKER=true on the worker service
const isWorker = process.env.WORKER === "true";
await import(isWorker ? "./src/worker-main.js" : "./src/main.js");
