require("dotenv").config();
const { connectMongoDB } = require("../config/database");
const logger = require("../config/logger");

// Boot all workers
const emailWorker = require("./emailWorker");
const reportWorker = require("./reportWorker");
const notificationWorker = require("./notificationWorker");

const workers = [emailWorker, reportWorker, notificationWorker];

const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down workers gracefully`);
  await Promise.all(workers.map((w) => w.close()));
  logger.info("All workers stopped");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

(async () => {
  await connectMongoDB();
  logger.info("🚀 All workers started");
  logger.info(`   → email worker       (concurrency: 10)`);
  logger.info(`   → report worker      (concurrency: 3)`);
  logger.info(`   → notification worker (concurrency: 15)`);
})();
