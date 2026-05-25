const { Queue } = require("bullmq");
const { createBullMQConnection } = require("../config/redis");
const logger = require("../config/logger");

const PRIORITY_MAP = {
  high: 1,
  medium: 5,
  low: 10,
};

const DEFAULT_JOB_OPTIONS = {
  attempts: parseInt(process.env.MAX_RETRIES) || 3,
  backoff: {
    type: "exponential",
    delay: parseInt(process.env.RETRY_DELAY_MS) || 5000,
  },
  removeOnComplete: { count: 100, age: 86400 }, // keep last 100 or 24hrs
  removeOnFail: { count: 500 },
};

const queues = {};

const getQueue = (name) => {
  if (!queues[name]) {
    queues[name] = new Queue(name, {
      connection: createBullMQConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });

    queues[name].on("error", (err) => {
      logger.error(`Queue [${name}] error: ${err.message}`);
    });

    logger.info(`📦 Queue [${name}] initialized`);
  }
  return queues[name];
};

const addJob = async (queueName, jobName, data, options = {}) => {
  const queue = getQueue(queueName);
  const priority = PRIORITY_MAP[options.priority || "medium"];

  const jobOptions = {
    ...DEFAULT_JOB_OPTIONS,
    priority,
    delay: options.delay || 0,
    attempts: options.maxAttempts || DEFAULT_JOB_OPTIONS.attempts,
  };

  if (options.scheduledFor) {
    const delay = new Date(options.scheduledFor).getTime() - Date.now();
    if (delay > 0) jobOptions.delay = delay;
  }

  const job = await queue.add(jobName, data, jobOptions);
  logger.info(`➕ Job [${job.id}] added to queue [${queueName}]`, {
    jobName,
    priority: options.priority || "medium",
  });
  return job;
};

const closeQueues = async () => {
  await Promise.all(Object.values(queues).map((q) => q.close()));
  logger.info("All queues closed");
};

module.exports = { getQueue, addJob, closeQueues, PRIORITY_MAP };
