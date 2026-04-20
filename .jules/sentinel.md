## 2024-06-07 - Weak Default Admin Password Generation
**Vulnerability:** The default admin password was generated using only 9 bytes of entropy and simplified with character replacements, resulting in a predictable 12-character string.
**Learning:** Low entropy and character substitutions in generated secrets significantly reduce the search space for brute-force attacks.
**Prevention:** Use at least 32 bytes of cryptographically secure entropy (`crypto.randomBytes(32)`) for auto-generated passwords and avoid simplifying the character set unless strictly necessary for the transport layer.

## 2026-04-05 - Admin Password Exposed in Logs
**Vulnerability:** The admin password was being printed to the console on server startup in `backend/server.js`.
**Learning:** Logging sensitive information like passwords or secrets to standard output or log files creates a security risk, as these logs can be accessed by unauthorized individuals or systems.
**Prevention:** Avoid logging any sensitive data. If a secret must be displayed once (e.g., during initial setup), ensure it is done through a secure channel and never persisted in general application logs.

## 2024-05-24 - Hardcoded Secret Removal
**Vulnerability:** A hardcoded `JWT_SECRET` and insecure `Math.random()` usage for game IDs in `backend/server.js`.
**Learning:** Default fallbacks for secrets like `process.env.JWT_SECRET || 'super_secret_chess_key'` allow an attacker to forge JWT tokens if the environment variable is not explicitly set, bypassing all admin authentication. Non-cryptographic pseudo-random number generators like `Math.random()` are predictable and not suited for secure identifier creation.
**Prevention:** Always use a cryptographically secure method to generate secrets (`crypto.randomBytes()`) on initial startup, store them persistently (e.g., in a local database like SQLite), and retrieve them at runtime. Use secure ID generation techniques everywhere.
