const rateLimit = require('express-rate-limit');
const logger = require('../logger');

// Retrieve limits from env or fallback to sensible defaults
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000; // 15 mins
const max = parseInt(process.env.RATE_LIMIT_MAX, 10) || 100; // 100 requests per 15 mins

/**
 * Rate limiting middleware applied selectively to POST /log.
 * Restricts client spam to prevent resource exhaustion.
 */
const postLogLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true, // Return rate limit info in standard headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: {
    error: 'Too many log submissions. Please slow down and try again later.'
  },
  handler: (req, res, next, options) => {
    logger.warn(
      { ip: req.ip, path: req.originalUrl, limit: max, windowMs },
      'Rate limit exceeded by client'
    );
    res.status(options.statusCode).json(options.message);
  }
});

module.exports = postLogLimiter;
