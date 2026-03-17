# MCP Server with Stage0 Authorization

A Model Context Protocol (MCP) server demonstrating how to guard tool calls with Stage0 runtime policy validation. This example shows how AI agents can be prevented from executing unauthorized actions before they happen.

## Problem Scenario

AI agents can silently escalate from safe operations into dangerous ones:

- **Research → Publication**: Agent researches a topic, then publishes findings without approval
- **Analysis → Deployment**: Agent investigates an incident, then deploys changes autonomously
- **Drafting → Execution**: Agent drafts content, then executes publication workflows
- **Investigation → Loop**: Agent keeps retrying failing operations, consuming resources

**Stage0 solves this** by validating every execution intent before the action happens, returning an external verdict: `ALLOW`, `DENY`, or `DEFER`.

## Where Stage0 Fits

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI Agent Runtime                            │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│  │  LLM     │───▶│  Tools   │───▶│ Actions  │                  │
│  └──────────┘    └──────────┘    └──────────┘                  │
│                       │                                         │
│                       ▼                                         │
│              ┌─────────────────┐                                │
│              │    Stage0       │  ◀── External Policy Authority │
│              │  (Guard Layer)  │                                │
│              └─────────────────┘                                │
│                       │                                         │
│                       ▼                                         │
│              ┌─────────────────┐                                │
│              │ ALLOW / DENY /  │                                │
│              │     DEFER       │                                │
│              └─────────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

**Stage0 sits between tool invocation and execution** - it's NOT part of the agent. The agent cannot self-approve actions. All execution intent MUST be validated via Stage0 `/check` endpoint.

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- (Optional) Stage0 API key from [SignalPulse](https://signalpulse.org)

### Installation

```bash
# Navigate to the example directory
cd example/mcp-server-stage0-authorization

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Build the TypeScript
npm run build
```

### Configure API Key (Optional)

Edit `.env` and add your Stage0 API key:

```env
STAGE0_API_KEY=your_api_key_here
STAGE0_BASE_URL=https://api.signalpulse.org
```

**Note**: Without an API key, the server uses simulated Stage0 responses. This is useful for testing the integration flow.

### Run the Demo

```bash
# Demo 1: ALLOW scenario - research tool call
npm run demo:allow

# Demo 2: DENY scenario - publish tool call  
npm run demo:deny

# Demo 3: DEFER scenario - loop threshold exceeded
npm run demo:defer
```

## Expected Output

### ALLOW Example (Research)

```
======================================================================
DEMO: ALLOW Scenario - Research Tool Call
======================================================================

Scenario: An agent wants to research a topic and return
informational summary. This is a low-risk operation.

Calling Stage0 to check authorization...

Response from Stage0:
----------------------------------------------------------------------
Verdict:        ALLOW
Decision:       GO
Reason:         Informational operation with no high-risk side effects
Request ID:     a1b2c3d4-e5f6-7890-abcd-ef1234567890
Policy Version: simulated-v1.0.0
Risk Score:     15
High Risk:      false
----------------------------------------------------------------------

✅ TOOL CALL ALLOWED

The agent can proceed to execute the research tool.
This is safe because:
- No side effects (publish, deploy, etc.)
- Informational operation only
- No guardrail violations
```

### DENY Example (Publish)

```
======================================================================
DEMO: DENY Scenario - Publish Tool Call
======================================================================

Scenario: An agent attempts to publish content to a public
channel without proper authorization. This is a high-risk
operation that should be blocked.

Calling Stage0 to check authorization...

Response from Stage0:
----------------------------------------------------------------------
Verdict:        DENY
Decision:       NO_GO
Reason:         HIGH severity: SIDE_EFFECTS_NEED_GUARDRAILS - 'publish' 
                side effect requires approval guardrails
Request ID:     b2c3d4e5-f6a7-8901-bcde-f12345678901
Policy Version: simulated-v1.0.0
Risk Score:     85
High Risk:      true

Issues detected:
  [HIGH] SIDE_EFFECTS_NEED_GUARDRAILS: Side effects [publish] require 
         approval guardrails
----------------------------------------------------------------------

⛔ TOOL CALL BLOCKED

The agent is NOT allowed to execute this tool.
This is correct because:
- "publish" side effect requires approval guardrails
- No human approval was provided
- Publishing without review can cause trust/compliance issues
```

### DEFER Example (Loop)

```
======================================================================
DEMO: DEFER Scenario - Loop/Retry Threshold
======================================================================

Scenario: An agent has retried a failing workflow multiple times
and wants to continue. Stage0 DEFERs to require human review.

Calling Stage0 to check authorization...

Response from Stage0:
----------------------------------------------------------------------
Verdict:        DEFER
Decision:       DEFER
Reason:         Loop threshold reached (5 retries): human confirmation
                required before extending retry budget
Request ID:     c3d4e5f6-a7b8-9012-cdef-123456789012
Policy Version: simulated-v1.0.0
Risk Score:     60

Questions for human review:
  ? Should the agent continue with additional retries?
  ? Is this workflow within the expected retry budget?
----------------------------------------------------------------------

⏸️ TOOL CALL DEFERRED

The agent should NOT proceed automatically.
Human review is required because:
- Loop threshold exceeded (5 retries)
- Continuing could waste resources or amplify issues
- A human checkpoint is safer than silent continuation
```

## Where `request_id` and `policy_version` Appear

Every Stage0 `/check` response includes:

| Field | Description | Location |
|-------|-------------|----------|
| `request_id` | Unique identifier for this authorization request | Use for audit logs, debugging, and traceability |
| `policy_version` | Version of the policy pack used for evaluation | Use for compliance and reproducibility |

These fields are returned in the API response:

```json
{
  "verdict": "DENY",
  "decision": "NO_GO",
  "reason": "...",
  "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "policy_version": "v1.2.3",
  "risk_score": 85,
  "high_risk": true
}
```

## Running as MCP Server

To use this as an MCP server with Claude Desktop or other MCP clients:

### 1. Build the server

```bash
npm run build
```

### 2. Add to Claude Desktop config

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or equivalent:

```json
{
  "mcpServers": {
    "stage0-authorization": {
      "command": "node",
      "args": ["/path/to/mcp-server-stage0-authorization/dist/index.js"],
      "env": {
        "STAGE0_API_KEY": "your_api_key_here",
        "STAGE0_BASE_URL": "https://api.signalpulse.org"
      }
    }
  }
}
```

### 3. Available Tools

| Tool | Description | Risk Level | Expected Verdict |
|------|-------------|------------|------------------|
| `research-topic` | Research and summarize a topic | Low | ALLOW |
| `publish-content` | Publish content to a channel | High | DENY |
| `deploy-changes` | Deploy to environment | High | DENY |
| `retry-workflow` | Retry a failing workflow | Medium | DEFER (if threshold exceeded) |
| `check-authorization` | Check if action would be authorized | N/A | Returns verdict |

## Integration Guide

To add Stage0 authorization to your MCP server:

```typescript
import { Stage0Client } from './stage0-client.js';

const stage0 = new Stage0Client();

server.tool('my-tool', 'Description', schema, async (params) => {
  // 1. Check authorization before execution
  const response = await stage0.checkGoal(
    'Description of what this tool does',
    {
      sideEffects: ['publish'], // or ['deploy'], ['loop'], etc.
    }
  );

  // 2. Handle the verdict
  if (response.verdict === 'DENY') {
    return {
      content: [{
        type: 'text',
        text: `Blocked: ${response.reason}`,
      }],
    };
  }

  if (response.verdict === 'DEFER') {
    return {
      content: [{
        type: 'text',
        text: `Deferred: ${response.reason}`,
      }],
    };
  }

  // 3. Execute only if ALLOWED
  const result = await doSomething(params);
  return {
    content: [{
      type: 'text',
      text: result,
    }],
  };
});
```

## Why This Matters

| Without Stage0 | With Stage0 |
|---------------|-------------|
| Agent executes every planned step | Agent validates before execution |
| Silent escalation to dangerous actions | External authority checks intent |
| Self-approved publication/deployment | Human approval required |
| Runaway retry loops | Loop thresholds enforced |
| Post-hoc detection only | Prevention before execution |

## Getting an API Key

1. Visit [signalpulse.org](https://signalpulse.org)
2. Create an account
3. Subscribe to a plan
4. Generate an API key
5. Add to `.env` file

## Related Examples

This example is part of the SignalPulse framework quickstart collection:

- **OpenAI Agents SDK** - [github.com/Starlight143/openai-agents-stage0](https://github.com/Starlight143/openai-agents-stage0)
- **LangGraph** - [github.com/Starlight143/langgraph-stage0](https://github.com/Starlight143/langgraph-stage0)
- **MCP Server** - [github.com/Starlight143/mcp-server-stage0-authorization](https://github.com/Starlight143/mcp-server-stage0-authorization) (this repo)

## License

MIT