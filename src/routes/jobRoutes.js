const express = require("express");
const router = express.Router();
const { validateJob } = require("../middleware/validate");
const { addJob, getQueue } = require("../queues/queueFactory");
const Job = require("../models/jobModel");
const logger = require("../config/logger");

// ─── POST /api/jobs ───────────────────────────────────────────────────────────
// Create and enqueue a new job
router.post("/", validateJob, async (req, res, next) => {
  try {
    const { queueName, jobName, data, priority, maxAttempts, scheduledFor, delay } = req.body;

    // Add to BullMQ
    const bullJob = await addJob(queueName, jobName, data, {
      priority,
      maxAttempts,
      scheduledFor,
      delay,
    });

    // Persist to MongoDB (upsert to safely handle duplicate jobIds across restarts)
    const job = await Job.findOneAndUpdate(
      { jobId: bullJob.id },
      {
        $set: {
          jobId: bullJob.id,
          name: jobName,
          queueName,
          priority,
          data,
          maxAttempts,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
          status: "pending",
        },
        $push: {
          logs: {
            attempt: 0,
            status: "started",
            message: "Job created and queued",
          },
        },
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      success: true,
      message: "Job created successfully",
      job: {
        id: job.jobId,
        name: job.name,
        queue: job.queueName,
        status: job.status,
        priority: job.priority,
        createdAt: job.createdAt,
        scheduledFor: job.scheduledFor,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/jobs ────────────────────────────────────────────────────────────
// List jobs with filtering, pagination
router.get("/", async (req, res, next) => {
  try {
    const {
      queue,
      status,
      priority,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    const filter = {};
    if (queue) filter.queueName = queue;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = order === "asc" ? 1 : -1;

    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(parseInt(limit))
        .select("-logs"), // exclude logs for list view
      Job.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: jobs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/jobs/metrics ────────────────────────────────────────────────────
// Queue metrics per queue + overall summary
router.get("/metrics", async (req, res, next) => {
  try {
    const [metrics, summary] = await Promise.all([
      Job.getMetrics(),
      Job.getSummary(),
    ]);

    // Also grab live BullMQ counts
    const queues = ["email", "report", "notification"];
    const bullCounts = {};
    await Promise.all(
      queues.map(async (q) => {
        const queue = getQueue(q);
        const counts = await queue.getJobCounts(
          "waiting", "active", "completed", "failed", "delayed"
        );
        bullCounts[q] = counts;
      })
    );

    res.json({
      success: true,
      data: {
        summary,
        byQueue: metrics,
        liveQueueCounts: bullCounts,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/jobs/:id ────────────────────────────────────────────────────────
// Get a single job with full logs
router.get("/:id", async (req, res, next) => {
  try {
    const job = await Job.findOne({ jobId: req.params.id });
    if (!job) return res.status(404).json({ success: false, error: "Job not found" });

    // Also check BullMQ for live state
    let bullState = null;
    try {
      const queue = getQueue(job.queueName);
      const bullJob = await queue.getJob(req.params.id);
      if (bullJob) {
        bullState = {
          state: await bullJob.getState(),
          progress: bullJob.progress,
          attemptsMade: bullJob.attemptsMade,
          processedOn: bullJob.processedOn,
          finishedOn: bullJob.finishedOn,
        };
      }
    } catch (_) {}

    res.json({ success: true, data: job, liveState: bullState });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/jobs/:id ─────────────────────────────────────────────────────
// Cancel / remove a job
router.delete("/:id", async (req, res, next) => {
  try {
    const job = await Job.findOne({ jobId: req.params.id });
    if (!job) return res.status(404).json({ success: false, error: "Job not found" });

    if (job.status === "processing") {
      return res.status(409).json({ success: false, error: "Cannot cancel a job that is currently processing" });
    }

    // Remove from BullMQ
    try {
      const queue = getQueue(job.queueName);
      const bullJob = await queue.getJob(req.params.id);
      if (bullJob) await bullJob.remove();
    } catch (_) {}

    // Mark as cancelled (dead) in MongoDB
    job.status = "dead";
    job.logs.push({ attempt: job.attempts, status: "failed", message: "Cancelled by user" });
    await job.save();

    res.json({ success: true, message: "Job cancelled successfully" });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/jobs/:id/retry ─────────────────────────────────────────────────
// Manually retry a failed/dead job
router.post("/:id/retry", async (req, res, next) => {
  try {
    const job = await Job.findOne({ jobId: req.params.id });
    if (!job) return res.status(404).json({ success: false, error: "Job not found" });

    if (!["failed", "dead"].includes(job.status)) {
      return res.status(409).json({
        success: false,
        error: `Job cannot be retried — current status: ${job.status}`,
      });
    }

    // Re-add to BullMQ
    const newBullJob = await addJob(job.queueName, job.name, job.data, {
      priority: job.priority,
    });

    // Update MongoDB record
    job.jobId = newBullJob.id;
    job.status = "pending";
    job.attempts = 0;
    job.error = undefined;
    job.result = undefined;
    job.startedAt = undefined;
    job.completedAt = undefined;
    job.failedAt = undefined;
    job.logs.push({ attempt: 0, status: "started", message: "Manually retried" });
    await job.save();

    logger.info(`🔁 Job manually retried → new id: ${newBullJob.id}`);
    res.json({ success: true, message: "Job requeued", newJobId: newBullJob.id });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/jobs/queue/:queueName/drain ────────────────────────────────────
// Drain (pause + empty) a queue — admin use
router.post("/queue/:queueName/drain", async (req, res, next) => {
  try {
    const { queueName } = req.params;
    const validQueues = ["email", "report", "notification"];
    if (!validQueues.includes(queueName)) {
      return res.status(400).json({ success: false, error: "Invalid queue name" });
    }

    const queue = getQueue(queueName);
    await queue.drain();
    logger.warn(`🚰 Queue [${queueName}] drained`);
    res.json({ success: true, message: `Queue [${queueName}] drained` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;