const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../logger');
const { calculateHash, formatTimestamp } = require('../utils/hash');
const postLogLimiter = require('../middleware/rateLimiter');

// Concurrency queue to serialize writes in Node.js
// This prevents race conditions where concurrent requests fetch the same previous_hash
// before inserting, which would break the sequential chain.
let writeQueue = Promise.resolve();

/**
 * @route   POST /api/logs
 * @desc    Append a new log entry to the chain
 * @access  Private (API Key Required)
 */
router.post('/log', postLogLimiter, async (req, res) => {
  const { actor, action, payload } = req.body;

  // 1. Basic validation
  if (!actor || typeof actor !== 'string' || actor.trim() === '') {
    return res.status(400).json({ error: 'Missing or invalid required field: actor (non-empty string)' });
  }
  if (!action || typeof action !== 'string' || action.trim() === '') {
    return res.status(400).json({ error: 'Missing or invalid required field: action (non-empty string)' });
  }
  if (payload === undefined || payload === null || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid required field: payload (must be a JSON object)' });
  }

  // 2. Queue write operations to handle concurrency safely
  writeQueue = writeQueue.then(async () => {
    try {
      // Fetch the latest log entry to find the previous current_hash
      const [rows] = await db.query('SELECT current_hash FROM logs ORDER BY id DESC LIMIT 1');
      const previousHash = rows.length > 0 ? rows[0].current_hash : '0'; // '0' is the genesis block hash

      // Format current timestamp (truncating milliseconds for MySQL compatibility)
      const timestamp = formatTimestamp(new Date());

      // Generate SHA-256 hash for the new log block
      const currentHash = calculateHash(previousHash, actor, action, payload, timestamp);

      // Insert log entry into MySQL
      const [result] = await db.query(
        'INSERT INTO logs (actor, action, payload, previous_hash, current_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [actor, action, JSON.stringify(payload), previousHash, currentHash, new Date(timestamp)]
      );

      logger.info(
        { logId: result.insertId, actor, action, currentHash },
        'Log entry successfully appended to chain'
      );

      // Return the newly created log entry details
      res.status(201).json({
        id: result.insertId,
        actor,
        action,
        payload,
        previous_hash: previousHash,
        current_hash: currentHash,
        created_at: timestamp
      });
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to append log entry to database');
      res.status(500).json({ error: 'Database error. Failed to save log.' });
    }
  });
});

/**
 * @route   GET /api/logs/:id
 * @desc    Fetch a single log entry and check its tamper verification status
 * @access  Private (API Key Required)
 */
router.get('/log/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.query('SELECT * FROM logs WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: `Log entry with ID ${id} not found.` });
    }

    const row = rows[0];
    const timestamp = formatTimestamp(row.created_at);

    // Recompute the hash to check if this specific entry has been tampered with
    const computedHash = calculateHash(row.previous_hash, row.actor, row.action, row.payload, timestamp);
    const isVerified = computedHash === row.current_hash;

    if (!isVerified) {
      logger.warn({ id: row.id, storedHash: row.current_hash, computedHash }, 'Individual log verification failed: Row has been tampered!');
    }

    res.json({
      log: {
        id: row.id,
        actor: row.actor,
        action: row.action,
        payload: row.payload,
        previous_hash: row.previous_hash,
        current_hash: row.current_hash,
        created_at: timestamp
      },
      verified: isVerified
    });
  } catch (err) {
    logger.error({ err: err.message, logId: id }, 'Error retrieving log entry');
    res.status(500).json({ error: 'Database error. Failed to retrieve log.' });
  }
});

/**
 * @route   GET /api/verify
 * @desc    Verify the integrity of the entire append-only log chain
 * @access  Private (API Key Required)
 */
router.get('/verify', async (req, res) => {
  try {
    // Read all logs sequentially in ascending order
    const [rows] = await db.query('SELECT * FROM logs ORDER BY id ASC');

    let expectedPreviousHash = '0'; // First entry expects the genesis previous_hash '0'

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const timestamp = formatTimestamp(row.created_at);

      // Check linkage: Does this block's previous_hash point to the last block's current_hash?
      if (row.previous_hash !== expectedPreviousHash) {
        logger.warn(
          {
            brokenId: row.id,
            expectedLink: expectedPreviousHash,
            actualLink: row.previous_hash
          },
          'Verification failed: Hash chain linkage broken'
        );
        return res.json({
          status: 'fail',
          broken_entry: row.id,
          reason: `Linkage mismatch. Entry expects previous hash '${expectedPreviousHash}' but found '${row.previous_hash}'.`
        });
      }

      // Check data integrity: Recompute hash from parameters and compare
      const computedHash = calculateHash(row.previous_hash, row.actor, row.action, row.payload, timestamp);
      if (computedHash !== row.current_hash) {
        logger.warn(
          {
            brokenId: row.id,
            storedHash: row.current_hash,
            computedHash
          },
          'Verification failed: Entry contents tampered'
        );
        return res.json({
          status: 'fail',
          broken_entry: row.id,
          reason: `Hash mismatch. Content modified on entry ID ${row.id}.`
        });
      }

      // Chain step: Update expectation for the next block
      expectedPreviousHash = row.current_hash;
    }

    // If the chain successfully passes all checks
    res.json({
      status: 'pass'
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to verify hash chain');
    res.status(500).json({ error: 'Server error during chain verification' });
  }
});

/**
 * @route   GET /api/export
 * @desc    Export JSON logs with optional filters (actor, startDate, endDate)
 * @access  Private (API Key Required)
 */
router.get('/export', async (req, res) => {
  const { actor, startDate, endDate } = req.query;

  try {
    let sql = 'SELECT * FROM logs WHERE 1=1';
    const params = [];

    // Add filter queries safely to prevent SQL injection
    if (actor && typeof actor === 'string' && actor.trim() !== '') {
      sql += ' AND actor = ?';
      params.push(actor.trim());
    }

    if (startDate) {
      const parsedStart = new Date(startDate);
      if (!isNaN(parsedStart.getTime())) {
        sql += ' AND created_at >= ?';
        params.push(parsedStart);
      } else {
        return res.status(400).json({ error: 'Invalid startDate format. Use YYYY-MM-DD or ISO strings.' });
      }
    }

    if (endDate) {
      const parsedEnd = new Date(endDate);
      if (!isNaN(parsedEnd.getTime())) {
        sql += ' AND created_at <= ?';
        params.push(parsedEnd);
      } else {
        return res.status(400).json({ error: 'Invalid endDate format. Use YYYY-MM-DD or ISO strings.' });
      }
    }

    sql += ' ORDER BY id ASC';

    const [rows] = await db.query(sql, params);

    // Map rows to a cleaner format with second-precision timestamps
    const exportedLogs = rows.map(row => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      payload: row.payload,
      previous_hash: row.previous_hash,
      current_hash: row.current_hash,
      created_at: formatTimestamp(row.created_at)
    }));

    logger.info(
      { count: exportedLogs.length, filters: { actor, startDate, endDate } },
      'Logs exported successfully'
    );

    res.json(exportedLogs);
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to export logs');
    res.status(500).json({ error: 'Database error. Failed to export logs.' });
  }
});

/**
 * @route   POST /dev/tamper
 * @desc    Simulate database tampering by modifying raw database values of an entry.
 *          Only active when NODE_ENV is development.
 * @access  Private (API Key Required)
 */
router.post('/dev/tamper', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Tamper simulation is disabled in production.' });
  }

  const { id, actor, action, payload } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Missing log ID to tamper with.' });
  }

  try {
    const updateFields = [];
    const params = [];

    if (actor !== undefined) {
      updateFields.push('actor = ?');
      params.push(actor);
    }
    if (action !== undefined) {
      updateFields.push('action = ?');
      params.push(action);
    }
    if (payload !== undefined) {
      updateFields.push('payload = ?');
      const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      params.push(payloadStr);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields provided to modify.' });
    }

    params.push(id);
    const sql = `UPDATE logs SET ${updateFields.join(', ')} WHERE id = ?`;
    const [result] = await db.query(sql, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `Log entry with ID ${id} not found.` });
    }

    logger.warn({ logId: id, updates: { actor, action, payload } }, 'Database entry maliciously tampered via developer endpoint!');

    res.json({
      message: `Log entry ${id} successfully tampered with.`,
      tampered_fields: { actor, action, payload }
    });
  } catch (err) {
    logger.error({ err: err.message, logId: id }, 'Failed to tamper with log entry');
    res.status(500).json({ error: 'Database error. Failed to tamper with log.' });
  }
});

module.exports = router;

