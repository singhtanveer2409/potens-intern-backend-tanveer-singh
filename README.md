# Tamper-Evident Append-Only Log Service

A production-inspired, beginner-friendly **Tamper-Evident Append-Only Log Service** built using Node.js, Express, and MySQL. This repository is structured to be easy to run locally, highly performant.

---

## 🚀 Key Architectural Highlights (Interview Topics)

When explaining this project in an interview, be sure to highlight these five key design decisions:

1. **Tamper-Evidence via Hash Chain**: Like a blockchain, each log entry contains a `previous_hash` and a `current_hash`. The current hash is computed using:
   `current_hash = SHA256(previous_hash + actor + action + payload + timestamp)`
   If a malicious actor modifies *any* field (even a typo in the payload) or tries to delete/insert a record in the database, the hash chain breaks, making tampering instantly evident.

2. **JSON Key Order Stability (`stableStringify`)**: In JavaScript, object keys are not guaranteed to be ordered consistently. If a payload is stringified as `{"a":1,"b":2}` but later verified as `{"b":2,"a":1}`, the hashes will not match, causing false-alarm tampering alerts. We implement a custom, dependency-free key-sorting serializer (`src/utils/hash.js`) to guarantee deterministic hashing.

3. **MySQL Millisecond Truncation Handling**: By default, MySQL's `TIMESTAMP` field stores date-times with 1-second precision (truncating milliseconds). If JS hashes a timestamp with milliseconds (e.g. `10.456Z`) and stores it, the database will save it as `10.000Z`. Upon retrieval, re-verification would fail. We solve this by truncating the milliseconds in JS (`formatTimestamp`) before hashing and database insertion.

4. **Concurrency Queue**: Node.js is single-threaded, but Express is asynchronous. If two requests append a log at the same time, they might both read the same `previous_hash` before either is saved, leading to a fork in the chain. We use a lightweight, memory-efficient Promise-based queue in `src/routes/logs.js` to serialize log writes.

5. **Why We Used MySQL (RDBMS Choice)**:
   * **Native JSON Data Type Support**: MySQL supports storing native `JSON` columns, which is perfect for log `payload` fields. It allows structured logs to be stored without losing queryability or indexing power.
   * **Demonstrating Database-Level Tampering**: Using an external relational database like MySQL allows us to easily simulate direct database tampering. An administrator (or malicious attacker) can bypass the application entirely and run `UPDATE` statements on raw rows (e.g., inside MySQL Workbench). The application's verification routine instantly detects this because the hash linkage is broken.
   * **ACID Compliance**: It ensures audit log writes are durable, transactional, and isolated from concurrency anomalies.

---

## 📁 Project Directory Structure

```
tamper-evident-logger/
 ├── public/                 # Web Dashboard Assets
 │    ├── index.html         # SaaS Dashboard layout
 │    ├── index.css          # Beautiful dark/neon styling and animations
 │    └── app.js             # API request handlers and visual chain rendering
 ├── src/
 │    ├── server.js          # App entry point, Express configuration & request logging
 │    ├── db.js              # MySQL connection pool initialization & self-test
 │    ├── logger.js          # Pino structured logging setup (pretty-printed locally)
 │    ├── routes/
 │    │    └── logs.js       # Log-related API endpoints (POST, GET, verify, export, tamper)
 │    ├── middleware/
 │    │    ├── auth.js       # Basic API key header check (x-api-key)
 │    │    └── rateLimiter.js# express-rate-limit configured for POST /log
 │    └── utils/
 │         └── hash.js       # Cryptographic hashing & date/JSON normalizers
 ├── schema.sql              # MySQL database initialization script
 ├── .env.example            # Environment configuration template
 ├── .env                    # Local environment config (ignore from git)
 ├── postman_collection.json # Ready-to-import Postman test suite
 ├── AI_usage_log.md         # Template documenting AI assistance
 └── package.json            # Dependencies and scripts
```

---

## 🛠️ Step-by-Step Setup

### Step 1: Create Database in MySQL Workbench
1. Open **MySQL Workbench** and connect to your local MySQL server instance.
2. Click the **"Create a new SQL tab"** button (top-left, looks like an SQL sheet with a lightning bolt).
3. Paste the contents of `schema.sql`:
   ```sql
   CREATE DATABASE IF NOT EXISTS log_service_db;
   USE log_service_db;

   CREATE TABLE IF NOT EXISTS logs (
       id INT AUTO_INCREMENT PRIMARY KEY,
       actor VARCHAR(255) NOT NULL,
       action VARCHAR(255) NOT NULL,
       payload JSON NOT NULL,
       previous_hash TEXT,
       current_hash TEXT NOT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```
4. Click the yellow **Lightning Bolt** icon to run the query.
5. In the left-hand Navigator panel, click **Schemas**, right-click, select **Refresh All**, and verify that `log_service_db` and its table `logs` are visible.

### Step 2: Environment Configuration
1. In the root directory of the project, make a copy of `.env.example` and name it `.env`.
2. Open `.env` and fill in your database credentials:
   ```env
   PORT=3000
   NODE_ENV=development
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=log_service_db
   API_KEY=mysecretkey
   ```

### Step 3: Install & Start
Open a terminal in the project directory and run:
```bash
# 1. Install dependencies
npm install

# 2. Start the service
npm start
```
You should see a Pino log in your console confirming a database connection:
```
[2026-05-21 15:23:10] INFO: Successfully established connection pool to MySQL
[2026-05-21 15:23:10] INFO: Tamper-Evident Log Service running in development mode on port 3000
```

### Step 4: Open the SaaS Dashboard Portal
Once the server is running, open your web browser and navigate to:
```
http://localhost:3000/
```
From this portal, you can interactively append logs, run cryptographic audit scans, filter exports, and trigger simulated database tampering to see integrity alerts in real-time.

---

## 📡 API Reference

> [!NOTE]
> All endpoints require the header `x-api-key: mysecretkey`.

### 1. Append Log
* **Endpoint:** `POST /log`
* **Rate Limiting:** Restricted to 100 requests per 15 minutes.
* **Body (JSON):**
```json
{
  "actor": "admin",
  "action": "create-user",
  "payload": {
    "userId": 123
  }
}
```
* **Response (201 Created):**
```json
{
  "id": 1,
  "actor": "admin",
  "action": "create-user",
  "payload": {
    "userId": 123
  },
  "previous_hash": "0",
  "current_hash": "a4d33fe837...",
  "created_at": "2026-05-21T09:54:10Z"
}
```

### 2. Verify Individual Log
* **Endpoint:** `GET /log/:id`
* **Response (200 OK):**
```json
{
  "log": {
    "id": 1,
    "actor": "admin",
    "action": "create-user",
    "payload": {
      "userId": 123
    },
    "previous_hash": "0",
    "current_hash": "a4d33fe837...",
    "created_at": "2026-05-21T09:54:10Z"
  },
  "verified": true
}
```

### 3. Verify Entire Chain Integrity
* **Endpoint:** `GET /verify`
* **Response (200 OK - Chain is Intact):**
```json
{
  "status": "pass"
}
```
* **Response (200 OK - Tampering Detected):**
```json
{
  "status": "fail",
  "broken_entry": 3,
  "reason": "Hash mismatch. Content modified on entry ID 3."
}
```

### 4. Export Filtered Logs
* **Endpoint:** `GET /export`
* **Query Parameters (Optional):**
  * `actor`: Filter by actor name.
  * `startDate`: ISO or date string (e.g. `2026-05-21`).
  * `endDate`: ISO or date string (e.g. `2026-05-22`).
* **Response (200 OK):**
```json
[
  {
    "id": 1,
    "actor": "admin",
    "action": "create-user",
    "payload": {
      "userId": 123
    },
    "previous_hash": "0",
    "current_hash": "a4d33fe837...",
    "created_at": "2026-05-21T09:54:10Z"
  }
]
```

### 5. Simulate Database Tampering (Development Only)
* **Endpoint:** `POST /dev/tamper`
* **Description:** Maliciously edits the text content in the database directly for a specific log ID, bypassing the hashing algorithms. Demonstrates how checking the row or scanning the chain will immediately capture the mismatch. Disabled when `NODE_ENV=production`.
* **Body (JSON):**
```json
{
  "id": 2,
  "actor": "malicious-attacker",
  "payload": {
    "compromised": true
  }
}
```
* **Response (200 OK):**
```json
{
  "message": "Log entry 2 successfully tampered with.",
  "tampered_fields": {
    "actor": "malicious-attacker",
    "payload": {
      "compromised": true
    }
  }
}
```

---

## 🛠️ How to Test Tamper Detection

You can demonstrate tamper-detection easily through either the **Interactive Web Dashboard** or **MySQL Command/Workbench**:

### Method A: Using the SaaS Web Dashboard (Recommended)
1. Navigate to `http://localhost:3000/`.
2. Append 3-4 log entries using the **Append Log Record** form.
3. Click **Run Cryptographic Audit** in the scanner. Confirm it shows a green **"SECURED"** badge.
4. Locate the **Tampering Simulator** card. Select one of the blocks (e.g. Block #2) and enter a malicious actor or payload change.
5. Click **Inject Database Tamper**.
6. Click **Audit Block** on Block #2. The block border will pulse red and turn into a **"TAMPERED"** state.
7. Click **Run Cryptographic Audit**. The global state indicator will flash red, showing **"COMPROMISED"**, pointing out exactly where the chain is broken (e.g. "Hash mismatch. Content modified on entry ID 2.").

### Method B: Manual Database Editing
1. Append 3-4 log entries using the dashboard.
2. Verify that `GET /verify` (or the dashboard audit) passes with a `pass` status.
3. Open **MySQL Workbench** and execute an update on row 2:
   ```sql
   UPDATE logs SET actor = 'malicious_user' WHERE id = 2;
   ```
4. Re-run the dashboard scan (or call `GET /verify`). The scan will immediately catch the discrepancy:
   ```json
   {
     "status": "fail",
     "broken_entry": 2,
     "reason": "Hash mismatch. Content modified on entry ID 2."
   }
   ```
5. Try changing the `previous_hash` of row 3 to attempt covering the tracks. The integrity check will catch a "Linkage mismatch" because row 3's `previous_hash` will no longer equal row 2's actual stored `current_hash`.

---

## 🔍 Common Debugging & Troubleshooting

### 1. `ECONNREFUSED` Database Connection Error
* **Problem**: Node cannot connect to MySQL.
* **Checks**:
  * Ensure MySQL Server is actually running.
  * Check that port `3306` matches your database configuration.
  * Check if your username is `root` and check if the password in `.env` is correct.

### 2. Validation Failures when Posting
* **Problem**: Returns `Missing or invalid required field: payload`.
* **Checks**:
  * Ensure the payload field is a JSON object (`{}`), not a string or array.
  * Ensure your headers in Postman/Curl contain `Content-Type: application/json`.

### 3. API Key Unauthorized (401)
* **Problem**: Returns `Unauthorized`.
* **Checks**:
  * Ensure the header is exactly spelled `x-api-key`.
  * Ensure the value matches the `API_KEY` defined in your `.env` file.

---

## 🤖 AI Collaboration and Transparency Log

This project was built using pair-programming collaboration with AI (specifically Google Gemini). We maintained an active [AI Usage Log] to document key prompts, architectural choices, and design choices.

Key areas of AI assistance included:
* Designing the stable JSON stringify serializer to resolve hash discrepancies.
* Pinpointing and mitigating MySQL timestamp millisecond truncation.
* Outlining the design tokens and layout for the SaaS visual dashboard.

You can view the full transcript of prompts and contributions in [AI_usage_log.md].

---
## UI
<img width="1919" height="981" alt="image" src="https://github.com/user-attachments/assets/e3ae16b5-6760-460e-aec3-2786705fa73c" />
<img width="1919" height="977" alt="image" src="https://github.com/user-attachments/assets/faa41a6e-d186-46e2-b6da-1f9e8fae0768" />

