const { getQueue, addJob } = require("./queueFactory");

const QUEUE_NAME = "email";

const emailQueue = {
  get queue() {
    return getQueue(QUEUE_NAME);
  },

  async add(jobName, data, options = {}) {
    return addJob(QUEUE_NAME, jobName, data, options);
  },

  // Convenience methods
  async sendWelcome(data, options = {}) {
    return this.add("send-welcome-email", data, { priority: "high", ...options });
  },

  async sendPasswordReset(data, options = {}) {
    return this.add("send-password-reset", data, { priority: "high", ...options });
  },

  async sendNewsletter(data, options = {}) {
    return this.add("send-newsletter", data, { priority: "low", ...options });
  },

  async sendTransactional(data, options = {}) {
    return this.add("send-transactional", data, { priority: "medium", ...options });
  },
};

module.exports = { emailQueue, QUEUE_NAME };
