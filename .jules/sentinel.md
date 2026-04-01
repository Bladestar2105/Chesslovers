## YYYY-MM-DD - [Title]
**Vulnerability:** [What you found]
**Learning:** [Why it existed]
**Prevention:** [How to avoid next time]
## 2024-05-24 - Hardcoded Secret Removal
**Vulnerability:** A hardcoded `JWT_SECRET` and insecure `Math.random()` usage for game IDs in `backend/server.js`.
**Learning:** Default fallbacks for secrets like `process.env.JWT_SECRET || 'super_secret_chess_key'` allow an attacker to forge JWT tokens if the environment variable is not explicitly set, bypassing all admin authentication. Non-cryptographic pseudo-random number generators like `Math.random()` are predictable and not suited for secure identifier creation.
**Prevention:** Always use a cryptographically secure method to generate secrets (`crypto.randomBytes()`) on initial startup, store them persistently (e.g., in a local database like SQLite), and retrieve them at runtime. Use secure ID generation techniques everywhere.
