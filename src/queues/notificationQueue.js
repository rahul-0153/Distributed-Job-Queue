const { getQueue, addJob } = require("./queueFactory");

const QUEUE_NAME = "notification";

const notificationQueue = {
  get queue() {
    return getQueue(QUEUE_NAME);
  },

  async add(jobName, data, options = {}) {
    return addJob(QUEUE_NAME, jobName, data, options);
  },

  async sendPush(data, options = {}) {
    return this.add("send-push-notification", data, { priority: "high", ...options });
  },

  async sendSMS(data, options = {}) {
    return this.add("send-sms", data, { priority: "high", ...options });
  },

  async sendSlack(data, options = {}) {
    return this.add("send-slack-message", data, { priority: "medium", ...options });
  },

  async sendWebhook(data, options = {}) {
    return this.add("send-webhook", data, { priority: "medium", ...options });
  },
};

module.exports = { notificationQueue, QUEUE_NAME };
