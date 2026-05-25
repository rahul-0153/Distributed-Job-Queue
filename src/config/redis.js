const Redis = require("ioredis");
require("dotenv").config();

const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
  retryStrategy: (times) => {
    const delay = Math.min(times * 500, 5000);
    return delay;
  },
  enableReadyCheck: false,
};

let redisClient = null;

const getRedisClient = () => {
  if (!redisClient) {
    redisClient = new Redis(redisConfig);

    redisClient.on("connect", () => {
      console.log("✅ Redis connected");
    });

    redisClient.on("error", (err) => {
      console.error("❌ Redis error:", err.message);
    });

    redisClient.on("reconnecting", () => {
      console.log("🔄 Redis reconnecting...");
    });
  }
  return redisClient;
};

// Separate connection for BullMQ (requires maxRetriesPerRequest: null)
const createBullMQConnection = () => new Redis(redisConfig);

module.exports = { getRedisClient, createBullMQConnection, redisConfig };
