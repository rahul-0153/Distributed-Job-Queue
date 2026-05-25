const { createWorker } = require("./workerFactory");
const logger = require("../config/logger");

const deliverNotification = async (channel, payload) => {
  const delay = Math.random() * 500 + 100;
  await new Promise((res) => setTimeout(res, delay));

  // 4% failure rate
  if (Math.random() < 0.04) throw new Error(`${channel} delivery failed: provider unavailable`);

  logger.debug(`🔔 [${channel}] notification delivered`, payload);
  return {
    notificationId: `ntf_${Date.now()}`,
    channel,
    deliveredAt: new Date(),
    ...payload,
  };
};

const notificationProcessor = async (job) => {
  const { name, data } = job;

  switch (name) {
    case "send-push-notification": {
      const { userId, deviceToken, title, body, imageUrl } = data;
      if (!deviceToken) throw new Error("Missing deviceToken");
      return deliverNotification("push", { userId, title, body, imageUrl });
    }

    case "send-sms": {
      const { phoneNumber, message } = data;
      if (!phoneNumber || !message) throw new Error("Missing phoneNumber or message");
      if (message.length > 160) throw new Error("SMS message exceeds 160 characters");
      return deliverNotification("sms", { phoneNumber, message });
    }

    case "send-slack-message": {
      const { channel, text, blocks, webhookUrl } = data;
      if (!channel && !webhookUrl) throw new Error("Missing channel or webhookUrl");
      return deliverNotification("slack", { channel, text, blocks });
    }

    case "send-webhook": {
      const { url, payload, headers } = data;
      if (!url) throw new Error("Missing webhook URL");
      // In production: use axios/fetch to POST to the URL
      return deliverNotification("webhook", { url, statusCode: 200 });
    }

    default:
      throw new Error(`Unknown notification job: ${name}`);
  }
};

const notificationWorker = createWorker("notification", notificationProcessor, { concurrency: 15 });

module.exports = notificationWorker;
