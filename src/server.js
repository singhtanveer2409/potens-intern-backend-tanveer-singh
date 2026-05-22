const express = require('express');
const logger = require('./logger');
const authMiddleware = require('./middleware/auth');
const logRoutes = require('./routes/logs');

// Ensure environment variables are loaded from the .env file
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON request bodies
app.use(express.json());

// Serve static frontend assets from 'public' directory
// Mount static middleware before authMiddleware to bypass authentication for frontend assets
app.use(express.static('public'));

// Custom middleware for structured logging of all incoming HTTP requests
app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.originalUrl, ip: req.ip }, 'Incoming request');
  
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(
      {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: duration
      },
      'Request completed'
    );
  });
  next();
});

// Apply simple API key authentication globally to all log endpoints
app.use(authMiddleware);

// Mount the log routes directly at root to match requested endpoints (POST /log, GET /verify, etc.)
app.use('/', logRoutes);

// Global unhandled error middleware to log exceptions and prevent crash/sensitive leaks
app.use((err, req, res, next) => {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled server exception occurred');
  res.status(500).json({ error: 'Internal Server Error. Please check server logs.' });
});

// Start listening for traffic
app.listen(PORT, () => {
  logger.info(`Tamper-Evident Log Service running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
