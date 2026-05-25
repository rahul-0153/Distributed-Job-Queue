const request = require("supertest");

// Mock Redis and MongoDB before importing app
jest.mock("../src/config/redis", () => ({
  getRedisClient: jest.fn(),
  createBullMQConnection: jest.fn(() => ({
    on: jest.fn(),
    disconnect: jest.fn(),
  })),
  redisConfig: {},
}));

jest.mock("../src/config/database", () => ({
  connectMongoDB: jest.fn().mockResolvedValue(true),
}));

jest.mock("../src/queues/queueFactory", () => ({
  addJob: jest.fn().mockResolvedValue({ id: "test-job-123" }),
  getQueue: jest.fn(() => ({
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 2, active: 1, completed: 10, failed: 0, delayed: 0,
    }),
    getJob: jest.fn().mockResolvedValue(null),
    drain: jest.fn().mockResolvedValue(true),
    close: jest.fn(),
    on: jest.fn(),
  })),
  closeQueues: jest.fn(),
}));

jest.mock("../src/models/jobModel", () => {
  const mockJob = {
    jobId: "test-job-123",
    name: "send-welcome-email",
    queueName: "email",
    status: "pending",
    priority: "high",
    data: { email: "test@example.com" },
    maxAttempts: 3,
    attempts: 0,
    createdAt: new Date(),
    logs: [],
    save: jest.fn().mockResolvedValue(true),
  };

  const MockJob = jest.fn().mockImplementation(() => mockJob);
  MockJob.create = jest.fn().mockResolvedValue(mockJob);
  MockJob.find = jest.fn(() => ({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue([mockJob]),
  }));
  MockJob.findOne = jest.fn().mockResolvedValue(mockJob);
  MockJob.findOneAndUpdate = jest.fn().mockResolvedValue(mockJob);
  MockJob.countDocuments = jest.fn().mockResolvedValue(1);
  MockJob.getMetrics = jest.fn().mockResolvedValue({
    email: { pending: 1, processing: 0, completed: 5, failed: 0, dead: 0 },
    report: { pending: 0, processing: 1, completed: 3, failed: 0, dead: 0 },
    notification: { pending: 2, processing: 0, completed: 8, failed: 1, dead: 0 },
  });
  MockJob.getSummary = jest.fn().mockResolvedValue({
    total: 20, pending: 3, processing: 1, completed: 16, failed: 0, dead: 0,
    successRate: "100.0", avgDurationMs: "342",
  });
  MockJob.aggregate = jest.fn().mockResolvedValue([]);

  return MockJob;
});

// Mock Bull Board
jest.mock("@bull-board/api", () => ({
  createBullBoard: jest.fn(() => ({ addQueue: jest.fn() })),
}));
jest.mock("@bull-board/api/bullMQAdapter", () => ({
  BullMQAdapter: jest.fn(),
}));
jest.mock("@bull-board/express", () => ({
  ExpressAdapter: jest.fn().mockImplementation(() => ({
    setBasePath: jest.fn(),
    getRouter: jest.fn(() => (req, res, next) => next()),
  })),
}));

const app = require("../src/app");

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.uptime).toBeDefined();
  });
});

describe("POST /api/jobs", () => {
  it("creates a job with valid payload", async () => {
    const res = await request(app).post("/api/jobs").send({
      queueName: "email",
      jobName: "send-welcome-email",
      data: { email: "user@example.com", firstName: "Alice" },
      priority: "high",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.job.id).toBe("test-job-123");
    expect(res.body.job.queue).toBe("email");
  });

  it("rejects missing queueName", async () => {
    const res = await request(app).post("/api/jobs").send({
      jobName: "send-welcome-email",
      data: { email: "user@example.com" },
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.details).toBeDefined();
  });

  it("rejects invalid queue name", async () => {
    const res = await request(app).post("/api/jobs").send({
      queueName: "invalid-queue",
      jobName: "test",
      data: {},
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("rejects invalid priority", async () => {
    const res = await request(app).post("/api/jobs").send({
      queueName: "email",
      jobName: "test",
      data: {},
      priority: "ultra",
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/jobs", () => {
  it("returns paginated job list", async () => {
    const res = await request(app).get("/api/jobs");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(1);
  });

  it("accepts queue filter", async () => {
    const res = await request(app).get("/api/jobs?queue=email&status=pending");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("GET /api/jobs/metrics", () => {
  it("returns metrics for all queues", async () => {
    const res = await request(app).get("/api/jobs/metrics");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.byQueue).toBeDefined();
    expect(res.body.data.liveQueueCounts).toBeDefined();
  });
});

describe("GET /api/jobs/:id", () => {
  it("returns a single job", async () => {
    const res = await request(app).get("/api/jobs/test-job-123");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.jobId).toBe("test-job-123");
  });
});

describe("POST /api/jobs/:id/retry", () => {
  it("retries a failed job", async () => {
    const Job = require("../src/models/jobModel");
    Job.findOne = jest.fn().mockResolvedValue({
      jobId: "test-job-123",
      name: "send-welcome-email",
      queueName: "email",
      status: "failed",
      priority: "medium",
      data: { email: "x@example.com" },
      attempts: 3,
      logs: [],
      save: jest.fn().mockResolvedValue(true),
    });

    const res = await request(app).post("/api/jobs/test-job-123/retry");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.newJobId).toBeDefined();
  });
});

describe("404 handler", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/api/unknown");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
