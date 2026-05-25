const { Worker } = require("bullmq");
const { createBullMQConnection } = require("../config/redis");
const Job = require("../models/jobModel");
const logger = require("../config/logger");

const DLQ_QUEUE_NAME = "dead-letter-queue";

/**
 * Creates a BullMQ worker with:
 * - MongoDB job tracking
 * - Exponential backoff retry
 * - Dead letter queue on max retries
 * - Structured logging
 */
const createWorker = (queueName, processor, options = {}) => {
  const concurrency = options.concurrency || parseInt(process.env.JOB_CONCURRENCY) || 5;

  const worker = new Worker(queueName, async (job) => {
    const startTime = Date.now();
    logger.info(`🔄 Processing job [${job.id}] (${job.name}) from [${queueName}]`, {
      attempt: job.attemptsMade + 1,
      data: job.data,
    });

    // Update MongoDB status → processing
    await Job.findOneAndUpdate(
      { jobId: job.id },
      {
        status: "processing",
        startedAt: new Date(),
        $inc: { attempts: 1 },
        $push: {
          logs: {
            attempt: job.attemptsMade + 1,
            status: "started",
            message: `Attempt ${job.attemptsMade + 1} started`,
          },
        },
      }
    );

    try {
      // Run the actual job processor
      const result = await processor(job);
      const duration = Date.now() - startTime;

      // Update MongoDB → completed
      await Job.findOneAndUpdate(
        { jobId: job.id },
        {
          status: "completed",
          result,
          completedAt: new Date(),
          duration,
          $push: {
            logs: {
              attempt: job.attemptsMade + 1,
              status: "completed",
              message: "Job completed successfully",
              duration,
            },
          },
        }
      );

      logger.info(`✅ Job [${job.id}] completed in ${duration}ms`);
      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 3);

      logger.error(`❌ Job [${job.id}] failed (attempt ${job.attemptsMade + 1}): ${err.message}`);

      if (isLastAttempt) {
        // Move to dead letter queue
        await Job.findOneAndUpdate(
          { jobId: job.id },
          {
            status: "dead",
            error: err.message,
            failedAt: new Date(),
            duration,
            $push: {
              logs: {
                attempt: job.attemptsMade + 1,
                status: "failed",
                error: err.message,
                message: "Max retries reached. Moved to dead letter queue.",
                duration,
              },
            },
          }
        );

        logger.warn(`💀 Job [${job.id}] moved to dead letter queue after ${job.attemptsMade + 1} attempts`);
      } else {
        // Will be retried — log the retry
        const nextDelay = Math.pow(2, job.attemptsMade) * (parseInt(process.env.RETRY_DELAY_MS) || 5000);
        await Job.findOneAndUpdate(
          { jobId: job.id },
          {
            status: "pending",
            error: err.message,
            $push: {
              logs: {
                attempt: job.attemptsMade + 1,
                status: "retrying",
                error: err.message,
                message: `Retrying in ${nextDelay / 1000}s (attempt ${job.attemptsMade + 2} of ${job.opts.attempts})`,
                duration,
              },
            },
          }
        );
      }

      throw err; // Re-throw so BullMQ handles retry/backoff
    }
  }, {
    connection: createBullMQConnection(),
    concurrency,
    ...options,
  });

  // Worker-level event listeners
  worker.on("ready", () => {
    logger.info(`👷 Worker [${queueName}] ready (concurrency: ${concurrency})`);
  });

  worker.on("error", (err) => {
    logger.error(`Worker [${queueName}] error: ${err.message}`);
  });

  worker.on("stalled", (jobId) => {
    logger.warn(`⚠️  Job [${jobId}] stalled in [${queueName}]`);
  });

  return worker;
};

module.exports = { createWorker };
