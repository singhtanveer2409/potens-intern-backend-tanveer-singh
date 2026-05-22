const crypto = require('crypto');

/**
 * Consistently stringifies a JSON object by sorting its keys.
 * This prevents hash mismatches that can occur when key order changes.
 * @param {*} val - Any value to stringify.
 * @returns {string} - Stable JSON string.
 */
function stableStringify(val) {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(val).sort();
  const properties = keys.map(key => {
    return `${JSON.stringify(key)}:${stableStringify(val[key])}`;
  });
  return '{' + properties.join(',') + '}';
}

/**
 * Formats a Date input into a second-precision ISO string (UTC).
 * MySQL TIMESTAMP columns by default store date/time with 1-second precision
 * (truncating milliseconds). To avoid hash verification mismatches when reading
 * logs back from the database, we drop milliseconds during hashing and insertion.
 * Example: "2026-05-21T15:23:10.789Z" -> "2026-05-21T15:23:10Z"
 * @param {Date|string|number} dateInput - Input timestamp.
 * @returns {string} - Formatted timestamp string.
 */
function formatTimestamp(dateInput) {
  const date = new Date(dateInput);
  return date.toISOString().split('.')[0] + 'Z';
}

/**
 * Generates a SHA-256 hash representing a log block.
 * Formula: SHA256(previous_hash + actor + action + payload + timestamp)
 * @param {string} previousHash - Hash of the preceding log entry (or '0' for first block).
 * @param {string} actor - The user/system making the log.
 * @param {string} action - The action performed.
 * @param {object|string} payload - Extra metadata.
 * @param {string} timestampFormatted - Formatted timestamp (without milliseconds).
 * @returns {string} - Hex encoded SHA-256 hash.
 */
function calculateHash(previousHash, actor, action, payload, timestampFormatted) {
  // If payload is a string (e.g. retrieved from database), attempt to parse it.
  // This allows stableStringify to sort keys consistently, preventing hash mismatches
  // between the original insertion (object) and verification (possibly string).
  let parsedPayload = payload;
  if (typeof payload === 'string') {
    try {
      parsedPayload = JSON.parse(payload);
    } catch (e) {
      parsedPayload = payload;
    }
  }

  const payloadStr = typeof parsedPayload === 'string' ? parsedPayload : stableStringify(parsedPayload);
  
  // Combine fields in exact designated order
  const data = (previousHash || '') + actor + action + payloadStr + timestampFormatted;
  
  return crypto.createHash('sha256').update(data).digest('hex');
}

module.exports = {
  stableStringify,
  formatTimestamp,
  calculateHash
};
