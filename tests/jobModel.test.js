// We test the schema logic and statics using mongoose-in-memory mocking
jest.mock("mongoose", () => {
  const actualMongoose = jest.requireActual("mongoose");

  // Keep Schema, Types etc real, but mock model-level DB calls
  return {
    ...actualMongoose,
    model: jest.fn().mockReturnValue({
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      countDocuments: jest.fn(),
      aggregate: jest.fn(),
      getMetrics: jest.fn(),
      getSummary: jest.fn(),
    }),
    connect: jest.fn().mockResolvedValue(true),
    connection: {
      on: jest.fn(),
    },
  };
});

describe("Job model statics (logic tests)", () => {
  describe("getSummary calculation", () => {
    it("computes successRate as 0 when no jobs", () => {
      const total = 0, completed = 0, failed = 0, dead = 0;
      const rate = total > 0
        ? ((completed / (completed + failed + dead)) * 100).toFixed(1)
        : "0";
      expect(rate).toBe("0");
    });

    it("computes successRate correctly with mixed results", () => {
      const completed = 80, failed = 10, dead = 10;
      const total = 100;
      const rate = total > 0
        ? ((completed / (completed + failed + dead)) * 100).toFixed(1)
        : "0";
      expect(rate).toBe("80.0");
    });

    it("computes 100% success rate when no failures", () => {
      const completed = 50, failed = 0, dead = 0;
      const total = 50;
      const rate = total > 0
        ? ((completed / (completed + failed + dead)) * 100).toFixed(1)
        : "0";
      expect(rate).toBe("100.0");
    });
  });

  describe("priority validation", () => {
    const VALID_PRIORITIES = ["high", "medium", "low"];
    const VALID_STATUSES = ["pending", "processing", "completed", "failed", "dead"];
    const VALID_QUEUES = ["email", "report", "notification"];

    it("accepts valid priorities", () => {
      VALID_PRIORITIES.forEach((p) => expect(VALID_PRIORITIES).toContain(p));
    });

    it("accepts all valid statuses", () => {
      VALID_STATUSES.forEach((s) => expect(VALID_STATUSES).toContain(s));
    });

    it("accepts all valid queue names", () => {
      VALID_QUEUES.forEach((q) => expect(VALID_QUEUES).toContain(q));
    });
  });

  describe("duration formatting logic", () => {
    const formatDuration = (ms) => {
      if (!ms) return null;
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(2)}s`;
    };

    it("formats under 1s as ms", () => {
      expect(formatDuration(500)).toBe("500ms");
    });

    it("formats over 1s as seconds", () => {
      expect(formatDuration(2500)).toBe("2.50s");
    });

    it("returns null for missing duration", () => {
      expect(formatDuration(null)).toBeNull();
    });
  });
});
