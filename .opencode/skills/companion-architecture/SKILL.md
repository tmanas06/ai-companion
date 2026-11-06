---
name: companion-architecture
description: Maintain a modular, secure, testable architecture for a cross-platform AI companion.
---

# Companion Architecture

- Plan before making major architectural changes.
- Keep frontend, backend, database, and provider boundaries explicit.
- Use validated API schemas and documented contracts.
- Enforce authentication and per-user authorization.
- Keep secrets and privileged operations on the server.
- Use database migrations for schema changes.
- Keep external provider integrations behind replaceable interfaces.
- Avoid unnecessary microservices in the initial version.
- Add automated tests for critical business logic and API endpoints.
- Document significant architectural decisions.
- Never run destructive commands or delete user data without explicit approval.
- Report actual test results; never claim unexecuted tests passed.
