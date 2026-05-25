const logger = require("../config/logger");

const errorHandler = (err, req, res, next) => {
  logger.error(`${req.method} ${req.path} → ${err.message}`, { stack: err.stack });

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: status === 500 ? "Internal server error" : err.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

const notFound = (req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
};

module.exports = { errorHandler, notFound };
