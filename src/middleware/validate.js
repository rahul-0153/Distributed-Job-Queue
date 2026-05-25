const Joi = require("joi");

const jobSchema = Joi.object({
  queueName: Joi.string().valid("email", "report", "notification").required(),
  jobName: Joi.string().min(1).max(100).required(),
  data: Joi.object().required(),
  priority: Joi.string().valid("high", "medium", "low").default("medium"),
  maxAttempts: Joi.number().integer().min(1).max(10).default(3),
  scheduledFor: Joi.date().iso().min("now").optional(),
  delay: Joi.number().integer().min(0).optional(),
});

const validateJob = (req, res, next) => {
  const { error, value } = jobSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: error.details.map((d) => d.message),
    });
  }
  req.body = value;
  next();
};

module.exports = { validateJob };
