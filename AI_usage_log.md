# AI Usage Log

This document records the AI tools used during the development of the Tamper-Evident Append-Only Log Service assignment, along with the type of assistance received and the final engineering decisions made during implementation.

---

# 1. AI Tools Used

| Tool | Model / Version | Usage |
|------|-----------------|-------|
| Google AI Studio | Gemini 2.5 Flash | Backend architecture guidance, route scaffolding, debugging, hashing consistency discussions |
| ChatGPT | GPT-5.5 | Git workflow guidance, project structuring, API design clarification, README refinement |

---

# 2. Areas Where AI Assistance Was Used

## Initial Project Planning
AI tools were used to:
- break down the assignment requirements into manageable modules
- suggest a beginner-friendly backend structure
- recommend splitting middleware, utilities, and routes into separate folders
- discuss tradeoffs between SQLite, PostgreSQL, and MySQL

Final decision:
- MySQL was selected because it was already installed locally and easier to debug using MySQL Workbench during rapid development.

---

## Hash Chain Design
AI assistance was used to:
- validate the SHA-256 chaining approach
- discuss deterministic hashing problems caused by inconsistent JSON key ordering
- identify timestamp formatting inconsistencies between JavaScript and MySQL

Final implementation decisions:
- payload objects are normalized before hashing
- timestamps are converted into a stable UTC string format before storage and verification
- each log stores both `previous_hash` and `current_hash` to support full-chain validation

Hash formula used:

SHA256(previous_hash + actor + action + payload + timestamp)

---

## API & Middleware Development
AI tools were used for:
- Express route scaffolding
- middleware examples
- request validation ideas
- rate limiting setup using `express-rate-limit`
- API key authentication middleware structure
- structured logging setup using Pino

However:
- route integration
- middleware ordering
- request flow debugging
- environment configuration
were manually adjusted and tested locally.

---

## Debugging & Error Resolution
AI assistance was used to troubleshoot:
- MySQL connection issues
- async route errors
- timestamp mismatches during verification
- hash verification edge cases
- Git commit organization and repository cleanup

All fixes were manually tested using:
- Postman
- MySQL Workbench
- local API verification endpoints

---

# 3. Human Decisions & Modifications

The following implementation decisions were made manually during development:

- Added stable payload normalization before hashing to prevent verification failures caused by JSON key ordering differences.
- Chose MySQL over SQLite/PostgreSQL for easier local debugging and setup speed within the 24-hour timeline.
- Kept authentication intentionally simple using API-key middleware to avoid unnecessary JWT/session complexity.
- Avoided ORMs like Prisma/Sequelize to keep the codebase lightweight and easier to reason about during debugging.
- Added a lightweight dashboard UI for easier visualization of logs and verification states during testing.
- Structured commits incrementally to reflect actual development progress instead of a single repository dump.

---

# 4. Transparency Note

AI tools were used heavily during development for learning, debugging, and implementation acceleration.

However:
- all generated code was reviewed manually
- all endpoints were tested locally
- project structure and final implementation decisions were intentionally simplified and adapted for maintainability and explainability
- no code was copied from external repositories