const { createWorker } = require("./workerFactory");
const logger = require("../config/logger");

// Simulate actual email sending (swap with Nodemailer/SendGrid in production)
const sendEmail = async ({ to, subject, body, template }) => {
  // Simulate network latency
  const delay = Math.random() * 800 + 200;
  await new Promise((res) => setTimeout(res, delay));

  // Simulate occasional failures for retry demo (5% failure rate)
  if (Math.random() < 0.05) {
    throw new Error("SMTP connection timeout");
  }

  logger.debug(`📧 Email sent to ${to}: "${subject}"`);
  return { messageId: `msg_${Date.now()}`, to, subject, sentAt: new Date() };
};

const emailProcessor = async (job) => {
  const { name, data } = job;

  switch (name) {
    case "send-welcome-email": {
      const { userId, email, firstName } = data;
      if (!email) throw new Error("Missing required field: email");
      return sendEmail({
        to: email,
        subject: `Welcome aboard, ${firstName || "there"}!`,
        template: "welcome",
        body: `Hi ${firstName}, your account (${userId}) is ready.`,
      });
    }

    case "send-password-reset": {
      const { email, resetToken, expiresIn } = data;
      if (!email || !resetToken) throw new Error("Missing email or resetToken");
      return sendEmail({
        to: email,
        subject: "Password Reset Request",
        template: "password-reset",
        body: `Your reset token: ${resetToken} (expires in ${expiresIn || "1 hour"})`,
      });
    }

    case "send-newsletter": {
      const { recipients, subject, content } = data;
      if (!recipients?.length) throw new Error("No recipients provided");

      // Process in batches of 50
      const results = [];
      for (let i = 0; i < recipients.length; i += 50) {
        const batch = recipients.slice(i, i + 50);
        await Promise.all(
          batch.map((email) => sendEmail({ to: email, subject, body: content }))
        );
        results.push(...batch);
        await job.updateProgress(Math.round(((i + 50) / recipients.length) * 100));
      }
      return { sent: results.length, subject };
    }

    case "send-transactional": {
      const { email, subject, body } = data;
      if (!email) throw new Error("Missing required field: email");
      return sendEmail({ to: email, subject, body });
    }

    default:
      throw new Error(`Unknown email job: ${name}`);
  }
};

const emailWorker = createWorker("email", emailProcessor, { concurrency: 10 });

module.exports = emailWorker;
