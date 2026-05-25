const mongoose = require("mongoose");

const JobLogSchema = new mongoose.Schema(
  {
    attempt: { type: Number, required: true },
    status: {
      type: String,
      enum: ["started", "completed", "failed", "retrying"],
      required: true,
    },
    message: String,
    error: String,
    duration: Number, // ms
  },
  { timestamps: true }
);

const JobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    queueName: {
      type: String,
      required: true,
      enum: ["email", "report", "notification"],
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "dead"],
      default: "pending",
      index: true,
    },
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
      index: true,
    },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    result: { type: mongoose.Schema.Types.Mixed },
    error: { type: String },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    scheduledFor: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    failedAt: { type: Date },
    duration: { type: Number }, // total processing time in ms
    logs: [JobLogSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: processing time in human-readable format
JobSchema.virtual("durationFormatted").get(function () {
  if (!this.duration) return null;
  if (this.duration < 1000) return `${this.duration}ms`;
  return `${(this.duration / 1000).toFixed(2)}s`;
});

// Static: get queue metrics
JobSchema.statics.getMetrics = async function () {
  const results = await this.aggregate([
    {
      $group: {
        _id: { queueName: "$queueName", status: "$status" },
        count: { $sum: 1 },
      },
    },
  ]);

  const metrics = {};
  const queues = ["email", "report", "notification"];
  const statuses = ["pending", "processing", "completed", "failed", "dead"];

  queues.forEach((q) => {
    metrics[q] = {};
    statuses.forEach((s) => (metrics[q][s] = 0));
  });

  results.forEach(({ _id, count }) => {
    if (metrics[_id.queueName]) {
      metrics[_id.queueName][_id.status] = count;
    }
  });

  return metrics;
};

// Static: get overall summary
JobSchema.statics.getSummary = async function () {
  const [total, pending, processing, completed, failed, dead] =
    await Promise.all([
      this.countDocuments(),
      this.countDocuments({ status: "pending" }),
      this.countDocuments({ status: "processing" }),
      this.countDocuments({ status: "completed" }),
      this.countDocuments({ status: "failed" }),
      this.countDocuments({ status: "dead" }),
    ]);

  const avgDuration = await this.aggregate([
    { $match: { status: "completed", duration: { $exists: true } } },
    { $group: { _id: null, avg: { $avg: "$duration" } } },
  ]);

  return {
    total,
    pending,
    processing,
    completed,
    failed,
    dead,
    successRate:
      total > 0 ? ((completed / (completed + failed + dead)) * 100).toFixed(1) : "0",
    avgDurationMs: avgDuration[0]?.avg?.toFixed(0) || 0,
  };
};

module.exports = mongoose.model("Job", JobSchema);
