const logger = require('../logger');

/**
 * Middleware to authenticate requests using an API Key.
 * Expects the 'x-api-key' header to match the configured API_KEY env variable.
 */
function authMiddleware(req, res, next) {
  const providedKey = req.headers['x-api-key'];
  const expectedKey = process.env.API_KEY || 'mysecretkey';

  if (!providedKey || providedKey !== expectedKey) {
    logger.warn(
      {
        ip: req.ip,
        path: req.originalUrl,
        method: req.method,
        hasKey: !!providedKey
      },
      'Unauthorized request blocked'
    );

    return res.status(401).json({
      error: 'Unauthorized. Please provide a valid API key in the x-api-key header.'
    });
  }

  next();
}

module.exports = authMiddleware;
