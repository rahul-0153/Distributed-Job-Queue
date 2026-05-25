require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");

const { connectMongoDB } = require("./config/database");
const logger = require("./config/logger");
const { getQueue, closeQueues } = require("./queues/queueFactory");
const jobRoutes = require("./routes/jobRoutes");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const app = express();

// ─── Security & Parsing ───────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP disabled for Bull Board
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging ──────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined", {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { success: false, error: "Too many requests, slow down" },
  standardHeaders: true,
  legacyHeaders: false,
}));

// ─── Bull Board Dashboard ─────────────────────────────────────────────────────
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/dashboard");

createBullBoard({
  queues: [
    new BullMQAdapter(getQueue("email")),
    new BullMQAdapter(getQueue("report")),
    new BullMQAdapter(getQueue("notification")),
  ],
  serverAdapter,
});

app.use("/dashboard", serverAdapter.getRouter());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime().toFixed(1) + "s",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

app.use("/api/jobs", jobRoutes);

app.get("/", (req, res) => {
  res.json({
    name: "Distributed Job Queue API",
    version: "1.0.0",
    endpoints: {
      dashboard: "/dashboard",
      health: "/health",
      jobs: "/api/jobs",
      metrics: "/api/jobs/metrics",
    },
  });
});

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Boot ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

const start = async () => {
  await connectMongoDB();

  // Pre-initialize queues so Bull Board shows them immediately
  getQueue("email");
  getQueue("report");
  getQueue("notification");

  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`   → API:       http://localhost:${PORT}/api/jobs`);
    logger.info(`   → Dashboard: http://localhost:${PORT}/dashboard`);
    logger.info(`   → Health:    http://localhost:${PORT}/health`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      await closeQueues();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

if (process.env.NODE_ENV !== "test") {
  start();
}

module.exports = app;
