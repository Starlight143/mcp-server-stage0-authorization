# AGENTS.md

> This file provides context for AI agents working with this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that demonstrates **server-side authorization** using Stage0 runtime policy validation. The key insight: authorization boundaries belong in server-side tool handlers, NOT in prompts.

## Repository Structure

```
mcp-server-stage0-authorization/
├── src/
│   ├── index.ts           # MCP Server entry point (6 tools)
│   ├── stage0-client.ts   # Stage0 API client with type-safe parsing
│   └── demo-*.ts          # Demo scripts (ALLOW/DENY/DEFER)
├── tests/
│   ├── stage0-client.test.ts  # 42 test cases
│   └── tools.test.ts          # Tool integration tests
├── package.json           # npm configuration
├── tsconfig.json          # TypeScript configuration
├── vitest.config.ts       # Test configuration
└── README.md              # User documentation
```

## Key Concepts

### Authorization Context Fields

When calling Stage0, these context fields should be passed from upstream:

| Field | Description | Example Values |
|-------|-------------|----------------|
| `actor_role` | Role of the entity performing the action | `admin`, `developer`, `viewer` |
| `approval_status` | Whether the action has been approved | `approved`, `pending`, `none` |
| `environment` | Target environment | `production`, `staging`, `development` |
| `resource_scope` | Scope of resources affected | `all`, `team-a`, `service-x` |

### Verdict Types

- **ALLOW**: Execution permitted
- **DENY**: Execution blocked (high-risk side effects without guardrails)
- **DEFER**: Human review required (loop threshold exceeded, vague requests)

### Side Effect Priority

```
DENY > DEFER > ALLOW
```

High-risk side effects (`publish`, `deploy`) take precedence over loop checks.

## Available Tools

| Tool | Risk Level | Side Effects | Context-Aware |
|------|------------|--------------|---------------|
| `research-topic` | Low | None | No |
| `publish-content` | High | `publish` | No |
| `deploy-changes` | High | `deploy` | Yes (`actor_role`) |
| `managed-deploy` | High | `deploy` | Yes (all fields) |
| `retry-workflow` | Medium | `loop` | Yes (`retry_count`) |
| `check-authorization` | N/A | None | Optional |

## Development Commands

```bash
npm run build      # Compile TypeScript
npm run clean      # Remove dist/
npm run rebuild    # Clean + build
npm test           # Run tests
npm run demo:allow # ALLOW scenario demo
npm run demo:deny  # DENY scenario demo
npm run demo:defer # DEFER scenario demo
```

## Integration Pattern

```typescript
import { Stage0Client, Stage0Context } from './stage0-client.js';

const stage0 = new Stage0Client();

server.tool('my-tool', schema, async (params) => {
  // 1. Check authorization BEFORE execution
  const response = await stage0.checkGoal(goal, {
    sideEffects: ['deploy'],
    context: { actor_role: 'admin', environment: 'production' },
    successCriteria: ['Operation completes'],
  });

  // 2. Handle verdict
  if (response.verdict !== 'ALLOW') {
    return { content: [{ type: 'text', text: `Blocked: ${response.reason}` }] };
  }

  // 3. Execute only if ALLOWED
  return executeHandler(params);
});
```

## Testing

- Uses Vitest for testing
- 42 test cases covering ALLOW/DENY/DEFER scenarios
- Tests run in simulated mode without API key
- Real API tests run when `STAGE0_API_KEY` is set

## Related Repositories

- [openai-agents-stage0](https://github.com/Starlight143/openai-agents-stage0) - OpenAI Agents SDK integration
- [langgraph-stage0](https://github.com/Starlight143/langgraph-stage0) - LangGraph integration