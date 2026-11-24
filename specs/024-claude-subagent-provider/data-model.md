# Data model
## FeatureContract
No table or column changes. One encrypted file `storage/.system-secrets/claude-subagent.enc` (Fernet, 0600), JSON envelope `{token, user_ids[≤10], status: unknown|ok|invalid|error, updated_at, checked_at}`.

API (platform admin): `GET /platform/claude-subagent` → `{set, last4, updated_at, status: none|unknown|ok|invalid|error, checked_at, users: [{id, full_name, email, firm_name, is_active, is_platform_admin}]}`; `PUT /token {token}`; `DELETE /token`; `POST /test` → `{ok, message, status}`; `PUT /users {user_ids}`; `GET /users/search?q=` → users (≤10).

`/chat/status` for a listed user: `{provider: "claude-subagent", model: "Claude (abonelik)", configured, external: true, error}`. Audit actions: `claude_subagent.token_saved | token_removed | users_set` (no values).
