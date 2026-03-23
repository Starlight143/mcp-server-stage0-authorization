#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Stage0Client, Stage0Context } from './stage0-client.js';

const server = new McpServer({
  name: 'stage0-authorization-server',
  version: '1.0.0',
});

const stage0 = new Stage0Client();

const guardedToolHandler = async (
  toolName: string,
  goal: string,
  sideEffects: string[],
  handler: () => Promise<string>,
  context?: Stage0Context,
  options?: {
    successCriteria?: string[];
    constraints?: string[];
    tools?: string[];
  }
) => {
  const response = await stage0.checkGoal(goal, { 
    sideEffects, 
    context,
    successCriteria: options?.successCriteria || [],
    constraints: options?.constraints || [],
    tools: options?.tools || [],
  });

  console.error('\n=== Stage0 Authorization ===');
  console.error(`Tool: ${toolName}`);
  console.error(`Goal: ${goal}`);
  console.error(`Verdict: ${response.verdict}`);
  console.error(`Decision: ${response.decision}`);
  console.error(`Request ID: ${response.request_id}`);
  console.error(`Policy Version: ${response.policy_version}`);
  console.error(`Reason: ${response.reason}`);
  console.error('============================\n');

  if (response.verdict === 'DENY') {
    return {
      content: [
        {
          type: 'text' as const,
          text: `⛔ BLOCKED by Stage0\n\nReason: ${response.reason}\n\nRequest ID: ${response.request_id}\nPolicy Version: ${response.policy_version}`,
        },
      ],
    };
  }

  if (response.verdict === 'DEFER') {
    const questions = response.defer_questions || response.clarifying_questions || [];
    const questionsText = questions.length > 0 
      ? `Questions:\n${questions.map((q) => `- ${q}`).join('\n')}\n\n` 
      : '';
    return {
      content: [
        {
          type: 'text' as const,
          text: `⏸️ DEFERRED by Stage0\n\nReason: ${response.reason}\n\n${questionsText}Request ID: ${response.request_id}\nPolicy Version: ${response.policy_version}`,
        },
      ],
    };
  }

  let result: string;
  try {
    result = await handler();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text' as const,
          text: `❌ ERROR during execution\n\nError: ${errorMsg}\n\nRequest ID: ${response.request_id}\nPolicy Version: ${response.policy_version}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: `✅ ALLOWED by Stage0\n\nRequest ID: ${response.request_id}\nPolicy Version: ${response.policy_version}\n\n---\n\n${result}`,
      },
    ],
  };
};

server.tool(
  'research-topic',
  'Research a topic and return informational summary (LOW RISK - typically ALLOWED)',
  {
    topic: z.string().describe('The topic to research'),
  },
  async ({ topic }) => {
    return guardedToolHandler(
      'research-topic',
      `Research and summarize: ${topic}`,
      [],
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return `Research Summary: ${topic}\n\nThis is an informational summary about ${topic}.\n\nKey findings:\n- Point 1: Overview of the topic\n- Point 2: Key considerations\n- Point 3: Common approaches\n\nThis research is for informational purposes only.`;
      },
      undefined,
      {
        successCriteria: [
          'Summary is accurate and relevant',
          'No external side effects',
        ],
        constraints: ['read-only'],
        tools: ['web_search', 'read_file'],
      }
    );
  }
);

server.tool(
  'publish-content',
  'Publish content to a public channel (HIGH RISK - typically DENIED)',
  {
    content: z.string().describe('The content to publish'),
    channel: z.string().describe('The target channel (e.g., "blog", "social", "docs")'),
  },
  async ({ content, channel }) => {
    return guardedToolHandler(
      'publish-content',
      `Publish content to ${channel}`,
      ['publish'],
      async () => {
        const preview = content.length > 200 ? `${content.substring(0, 200)}...` : content;
        return `Content published to ${channel}:\n\n${preview}`;
      },
      undefined,
      {
        successCriteria: [
          'Content published successfully',
        ],
        tools: ['shell', 'git'],
      }
    );
  }
);

server.tool(
  'deploy-changes',
  'Deploy changes to an environment. Context-aware: requires appropriate actor_role for production deployments.',
  {
    serviceName: z.string().describe('The service to deploy'),
    environment: z.enum(['staging', 'production']).describe('Target environment'),
    changes: z.string().describe('Description of changes'),
    actorRole: z.enum(['admin', 'developer', 'viewer']).optional().describe('Role of the actor performing deployment'),
  },
  async ({ serviceName, environment, changes, actorRole }) => {
    const context: Stage0Context = {
      environment,
      actor_role: actorRole || 'viewer',
    };

    return guardedToolHandler(
      'deploy-changes',
      `Deploy ${serviceName} to ${environment}`,
      ['deploy'],
      async () => {
        return `Deployment initiated:\n- Service: ${serviceName}\n- Environment: ${environment}\n- Changes: ${changes}\n- Actor Role: ${actorRole || 'viewer'}`;
      },
      context,
      {
        successCriteria: [
          'Deployment completes successfully',
        ],
        tools: ['shell', 'kubectl'],
      }
    );
  }
);

server.tool(
  'managed-deploy',
  'Deploy with full authorization context. Demonstrates actor_role, approval_status, environment, and resource_scope usage.',
  {
    serviceName: z.string().describe('The service to deploy'),
    environment: z.enum(['development', 'staging', 'production']).describe('Target environment'),
    changes: z.string().describe('Description of changes'),
    actorRole: z.enum(['admin', 'developer', 'viewer']).describe('Role of the actor (admin, developer, viewer)'),
    approvalStatus: z.enum(['approved', 'pending', 'none']).describe('Approval status for this deployment'),
    resourceScope: z.string().optional().describe('Resource scope (e.g., "team-a", "all", "service-x")'),
  },
  async ({ serviceName, environment, changes, actorRole, approvalStatus, resourceScope }) => {
    const context: Stage0Context = {
      actor_role: actorRole,
      approval_status: approvalStatus,
      environment,
      resource_scope: resourceScope || 'all',
    };

    const constraints: string[] = [];
    if (environment === 'production') {
      constraints.push('production_deployment');
      if (approvalStatus !== 'approved') {
        constraints.push('approval_required');
      }
    }
    if (actorRole === 'viewer') {
      constraints.push('read_only_role');
    }

    return guardedToolHandler(
      'managed-deploy',
      `Deploy ${serviceName} to ${environment} as ${actorRole}`,
      ['deploy'],
      async () => {
        return `Deployment Details:\n- Service: ${serviceName}\n- Environment: ${environment}\n- Changes: ${changes}\n- Actor Role: ${actorRole}\n- Approval Status: ${approvalStatus}\n- Resource Scope: ${resourceScope || 'all'}\n\nAuthorization Context Used:\n- actor_role: ${actorRole}\n- approval_status: ${approvalStatus}\n- environment: ${environment}\n- resource_scope: ${resourceScope || 'all'}`;
      },
      context,
      {
        successCriteria: [
          'Deployment completes successfully',
          'No unauthorized access to resources',
        ],
        constraints,
        tools: ['shell', 'kubectl', 'terraform'],
      }
    );
  }
);

server.tool(
  'retry-workflow',
  'Retry a failing workflow (MEDIUM RISK - may DEFER if loop threshold exceeded)',
  {
    workflowId: z.string().describe('The workflow ID to retry'),
    retryCount: z.number().int().nonnegative().describe('Current retry count (must be >= 0)'),
  },
  async ({ workflowId, retryCount }) => {
    return guardedToolHandler(
      'retry-workflow',
      `Retry workflow ${workflowId} (attempt ${retryCount + 1})`,
      ['loop'],
      async () => {
        return `Workflow ${workflowId} retried successfully.\nTotal attempts: ${retryCount + 1}`;
      },
      {
        run_id: workflowId,
        retry_count: retryCount,
      },
      {
        successCriteria: [
          'Workflow completes successfully',
        ],
        constraints: [
          'max_retries: 5',
        ],
        tools: ['shell', 'api_call'],
      }
    );
  }
);

server.tool(
  'check-authorization',
  'Check if an action would be authorized by Stage0 (does NOT execute the action)',
  {
    goal: z.string().describe('The goal/action to check'),
    sideEffects: z.array(z.string()).describe('List of side effects (e.g., "publish", "deploy", "loop")'),
    successCriteria: z.array(z.string()).optional().describe('List of success criteria'),
    retryCount: z.number().int().nonnegative().optional().describe('Current retry count (for loop scenarios, must be >= 0)'),
  },
  async ({ goal, sideEffects, successCriteria, retryCount }) => {
    const response = await stage0.checkGoal(goal, { 
      sideEffects,
      successCriteria: successCriteria || ['Task completes successfully'],
      context: retryCount !== undefined ? { retry_count: retryCount } : undefined,
    });

    let status: string;
    if (response.verdict === 'ALLOW') {
      status = '✅ ALLOWED';
    } else if (response.verdict === 'DEFER') {
      status = '⏸️ DEFERRED';
    } else {
      status = '⛔ DENIED';
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `${status}\n\nGoal: ${goal}\nSide Effects: ${sideEffects.join(', ') || 'None'}${successCriteria ? `\nSuccess Criteria: ${successCriteria.join(', ')}` : ''}${retryCount !== undefined ? `\nRetry Count: ${retryCount}` : ''}\n\nDecision: ${response.decision}\nReason: ${response.reason}\n\nRequest ID: ${response.request_id}\nPolicy Version: ${response.policy_version}\nRisk Score: ${response.risk_score}\nHigh Risk: ${response.high_risk}`,
        },
      ],
    };
  }
);

async function main() {
  console.error('Starting Stage0 Authorization MCP Server...');
  console.error('API Base URL:', process.env.STAGE0_BASE_URL || 'https://api.signalpulse.org');
  console.error('API Key configured:', !!process.env.STAGE0_API_KEY);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});