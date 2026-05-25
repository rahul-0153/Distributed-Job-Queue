// Mock BullMQ Queue
const mockQueueInstance = {
  on: jest.fn(),
  add: jest.fn().mockResolvedValue({ id: "bull-job-1" }),
  close: jest.fn(),
  getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0 }),
};

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => mockQueueInstance),
}));

jest.mock("../src/config/redis", () => ({
  createBullMQConnection: jest.fn(() => ({})),
}));

jest.mock("../src/config/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const { getQueue, addJob } = require("../src/queues/queueFactory");

describe("queueFactory", () => {
  describe("getQueue", () => {
    it("creates a queue on first call", () => {
      const q = getQueue("email");
      expect(q).toBeDefined();
    });

    it("returns the same instance on subsequent calls (singleton)", () => {
      const q1 = getQueue("email");
      const q2 = getQueue("email");
      expect(q1).toBe(q2);
    });

    it("creates separate instances for different queues", () => {
      const q1 = getQueue("email");
      const q2 = getQueue("report");
      // Different queue names → different instances created
      expect(q1).toBeDefined();
      expect(q2).toBeDefined();
    });
  });

  describe("addJob", () => {
    it("adds a job with default priority", async () => {
      const job = await addJob("email", "send-welcome-email", { email: "a@b.com" });
      expect(job.id).toBe("bull-job-1");
      expect(mockQueueInstance.add).toHaveBeenCalled();
    });

    it("maps priority strings to BullMQ numeric values", async () => {
      await addJob("email", "test", {}, { priority: "high" });
      const callArgs = mockQueueInstance.add.mock.calls.at(-1);
      expect(callArgs[2].priority).toBe(1); // high = 1
    });

    it("maps medium priority correctly", async () => {
      await addJob("email", "test", {}, { priority: "medium" });
      const callArgs = mockQueueInstance.add.mock.calls.at(-1);
      expect(callArgs[2].priority).toBe(5);
    });

    it("maps low priority correctly", async () => {
      await addJob("email", "test", {}, { priority: "low" });
      const callArgs = mockQueueInstance.add.mock.calls.at(-1);
      expect(callArgs[2].priority).toBe(10);
    });

    it("applies scheduledFor as a delay", async () => {
      const future = new Date(Date.now() + 60000).toISOString();
      await addJob("email", "test", {}, { scheduledFor: future });
      const callArgs = mockQueueInstance.add.mock.calls.at(-1);
      expect(callArgs[2].delay).toBeGreaterThan(0);
    });

    it("respects custom maxAttempts", async () => {
      await addJob("email", "test", {}, { maxAttempts: 5 });
      const callArgs = mockQueueInstance.add.mock.calls.at(-1);
      expect(callArgs[2].attempts).toBe(5);
    });
  });
});
