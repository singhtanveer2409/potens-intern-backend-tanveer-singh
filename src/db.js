const mysql = require('mysql2/promise');
const logger = require('./logger');

// Ensure environment variables are loaded
require('dotenv').config();

// Create a connection pool to manage MySQL database connections efficiently
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'log_service_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection immediately on startup
(async () => {
  try {
    const connection = await pool.getConnection();
    logger.info('Successfully established connection pool to MySQL');
    connection.release();
  } catch (err) {
    logger.error(
      { err: err.message },
      'Database connection failed. Please ensure MySQL is running and credentials in .env are correct.'
    );
  }
})();

module.exports = pool;
