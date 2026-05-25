const { getQueue, addJob } = require("./queueFactory");

const QUEUE_NAME = "report";

const reportQueue = {
  get queue() {
    return getQueue(QUEUE_NAME);
  },

  async add(jobName, data, options = {}) {
    return addJob(QUEUE_NAME, jobName, data, options);
  },

  async generatePDF(data, options = {}) {
    return this.add("generate-pdf-report", data, { priority: "medium", ...options });
  },

  async generateCSV(data, options = {}) {
    return this.add("generate-csv-export", data, { priority: "low", ...options });
  },

  async generateAnalytics(data, options = {}) {
    return this.add("generate-analytics", data, { priority: "high", ...options });
  },

  async generateDailyDigest(data, options = {}) {
    return this.add("generate-daily-digest", data, { priority: "low", ...options });
  },
};

module.exports = { reportQueue, QUEUE_NAME };
