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

## Why Server-Side Authorization?

A common mistake is to put authorization in the agent's prompt (e.g., "You are not allowed to deploy"). This approach has critical flaws:

| Prompt-Based Authorization | Server-Side Authorization |
|---------------------------|--------------------------|
| Agent can ignore instructions | Agent **cannot** bypass server checks |
| No audit trail of decisions | Every check logged with `request_id` |
| Different agents = different behaviors | Consistent enforcement across all clients |
| Can be overridden by user prompts | Enforced by external policy authority |
| No cryptographic proof of policy | `policy_version` ensures reproducibility |

**The authorization boundary must be in the server-side tool handler**, not in the prompt. This repository demonstrates exactly that pattern.

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- (Optional) Stage0 API key from [SignalPulse](https://signalpulse.org)

### Installation

```bash
# Clone the repository
git clone https://github.com/Starlight143/mcp-server-stage0-authorization.git
cd mcp-server-stage0-authorization

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

### DEFER Example (Vague Request)

```
======================================================================
DEMO: DEFER Scenario - Unclear/Vague Request
======================================================================

Scenario: An agent receives a vague request without clear
success criteria or value proposition. Stage0 DEFERs to
request more context before proceeding.

Calling Stage0 to check authorization...

Response from Stage0:
----------------------------------------------------------------------
Verdict:        DEFER
Decision:       DEFER
Reason:         UNCLEAR_VALUE_SIGNAL: Task appears under-specified 
                for reliable value delivery.
Request ID:     c3d4e5f6-a7b8-9012-cdef-123456789012
Policy Version: simulated-v1.0.0
Risk Score:     35

Clarifying questions:
  ? What is the specific outcome you want to achieve?
  ? What constraints or requirements should be considered?
----------------------------------------------------------------------

⏸️ TOOL CALL DEFERRED

The agent should NOT proceed automatically.
Human review is required because:
- Request is too vague to evaluate value
- Success criteria are unclear
- More context is needed before execution
```

**Note**: The actual verdict depends on your Stage0 plan and policy configuration:
- **Pro plans** may return `DEFER` for vague requests with `clarifying_questions`
- **Free/Starter plans** may return `ALLOW` with clarifying questions or `DENY` depending on policy settings
- The simulated response (without API key) demonstrates the expected `DEFER` behavior

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

Edit the Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "stage0-authorization": {
      "command": "node",
      "args": ["<REPO_PATH>/dist/index.js"],
      "env": {
        "STAGE0_API_KEY": "your_api_key_here",
        "STAGE0_BASE_URL": "https://api.signalpulse.org"
      }
    }
  }
}
```

Replace `<REPO_PATH>` with the actual path to your cloned repository.

### 3. Available Tools

| Tool | Description | Risk Level | Context-Aware |
|------|-------------|------------|---------------|
| `research-topic` | Research and summarize a topic | Low | No |
| `publish-content` | Publish content to a channel | High | No |
| `deploy-changes` | Deploy to environment | High | Yes (`actor_role`) |
| `managed-deploy` | Deploy with full authorization context | High | Yes (all fields) |
| `retry-workflow` | Retry a failing workflow | Medium | Yes (`retry_count`) |
| `check-authorization` | Check if action would be authorized | N/A | Optional |

## Authorization Context

The `managed-deploy` tool demonstrates the four critical context fields that should be passed from upstream:

| Field | Description | Example Values |
|-------|-------------|----------------|
| `actor_role` | Role of the entity performing the action | `admin`, `developer`, `viewer` |
| `approval_status` | Whether the action has been approved | `approved`, `pending`, `none` |
| `environment` | Target environment | `production`, `staging`, `development` |
| `resource_scope` | Scope of resources affected | `all`, `team-a`, `service-x` |

### Example: Role-Based Deployment Control

```typescript
const context: Stage0Context = {
  actor_role: 'developer',      // Who is performing the action
  approval_status: 'pending',   // Has this been approved?
  environment: 'production',    // Where is this deploying?
  resource_scope: 'team-a',     // What resources are affected?
};

const response = await stage0.checkGoal(
  'Deploy authentication service to production',
  {
    sideEffects: ['deploy'],
    context,
    successCriteria: ['Deployment completes successfully'],
  }
);
```

This context enables policy rules like:
- `viewer` role → DENY all deployments
- `developer` role → ALLOW staging, DENY production without approval
- `admin` role → ALLOW all with `approval_status: approved`

## Integration Guide

To add Stage0 authorization to your MCP server:

### Basic Pattern

```typescript
import { Stage0Client, Stage0Context } from './stage0-client.js';

const stage0 = new Stage0Client();

server.tool('my-tool', 'Description', schema, async (params) => {
  // 1. Check authorization before execution
  const response = await stage0.checkGoal(
    'Description of what this tool does',
    {
      sideEffects: ['publish'],
      successCriteria: ['Task completes successfully'],
      constraints: ['approval_required'],
    }
  );

  // 2. Handle the verdict
  if (response.verdict === 'DENY') {
    return {
      content: [{ type: 'text', text: `Blocked: ${response.reason}` }],
    };
  }

  if (response.verdict === 'DEFER') {
    return {
      content: [{ type: 'text', text: `Deferred: ${response.reason}` }],
    };
  }

  // 3. Execute only if ALLOWED
  const result = await doSomething(params);
  return {
    content: [{ type: 'text', text: result }],
  };
});
```

### With Authorization Context

For privileged operations, pass context from upstream:

```typescript
server.tool('deploy-service', 'Deploy a service', {
  serviceName: z.string(),
  environment: z.enum(['staging', 'production']),
  actorRole: z.enum(['admin', 'developer', 'viewer']),
}, async ({ serviceName, environment, actorRole }) => {
  const context: Stage0Context = {
    actor_role: actorRole,
    environment,
    approval_status: 'none', // Would come from your approval system
  };

  const response = await stage0.checkGoal(
    `Deploy ${serviceName} to ${environment}`,
    {
      sideEffects: ['deploy'],
      context,
      successCriteria: ['Deployment succeeds'],
    }
  );

  if (response.verdict !== 'ALLOW') {
    return {
      content: [{ 
        type: 'text', 
        text: `⛔ ${response.verdict}: ${response.reason}\n\nRequest ID: ${response.request_id}` 
      }],
    };
  }

  // Execute deployment
  return executeDeployment(serviceName, environment);
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

## Running Tests

This repository includes comprehensive smoke tests:

```bash
# Run all tests (uses simulated mode without API key)
npm test

# Run tests with real API
STAGE0_API_KEY=your_api_key npm test

# Run tests in watch mode
npm run test:watch
```

Tests cover:
- ALLOW/DENY/DEFER verdict scenarios
- Context propagation (`actor_role`, `environment`, etc.)
- Error handling and edge cases
- Real API integration (when API key provided)

## Related Examples

This example is part of the SignalPulse framework quickstart collection:

- **OpenAI Agents SDK** - [github.com/Starlight143/openai-agents-stage0](https://github.com/Starlight143/openai-agents-stage0)
- **LangGraph** - [github.com/Starlight143/langgraph-stage0](https://github.com/Starlight143/langgraph-stage0)
- **MCP Server** - [github.com/Starlight143/mcp-server-stage0-authorization](https://github.com/Starlight143/mcp-server-stage0-authorization) (this repo)

## License

MIT