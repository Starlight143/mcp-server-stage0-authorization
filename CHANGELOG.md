# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-03-23

### Added
- MCP Server with 6 tools demonstrating server-side authorization
- `research-topic` tool (LOW risk, typically ALLOWED)
- `publish-content` tool (HIGH risk, typically DENIED)
- `deploy-changes` tool with `actor_role` context
- `managed-deploy` tool with full authorization context (`actor_role`, `approval_status`, `environment`, `resource_scope`)
- `retry-workflow` tool with loop threshold detection
- `check-authorization` tool for previewing authorization decisions
- Stage0Client with type-safe API response parsing
- Simulated mode for testing without API key
- Vitest test framework with 42 test cases
- Demo scripts for ALLOW/DENY/DEFER scenarios

### Security
- Authorization boundary enforced in server-side tool handlers
- High-risk side effects (`publish`, `deploy`) blocked without guardrails
- Loop threshold (5 retries) prevents runaway operations
- All decisions logged with `request_id` and `policy_version`

### Documentation
- Comprehensive README with integration guide
- Server-side authorization explanation (vs prompt-based)
- Context field documentation
- AGENTS.md for AI agent context

### Dependencies
- @modelcontextprotocol/sdk ^1.0.0
- dotenv ^16.4.5
- zod ^3.23.8
- vitest ^4.1.0 (dev)
- typescript ^5.3.0 (dev)
- @types/node ^20.11.0 (dev)