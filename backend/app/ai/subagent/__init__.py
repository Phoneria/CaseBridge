"""Claude subagent provider (personal use of the platform owner's Claude
subscription via a `claude setup-token`).

Scope, by owner decision (24-25 Nov 2026) and Anthropic's terms: the token is
set only by the platform admin and serves only the user accounts the platform
admin names (the owner's own logins). Every other user's AI request keeps the
existing path (per-firm API key or the friendly fallback). The public site
cat never uses it. See specs/024-claude-subagent-provider/.
"""
