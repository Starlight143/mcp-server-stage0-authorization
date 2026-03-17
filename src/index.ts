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
  context?: Stage0Context
) => {
  const response = await stage0.checkGoal(goal, { sideEffects, context });

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
    return {
      content: [
        {
          type: 'text' as const,
          text: `⏸️ DEFERRED by Stage0\n\nReason: ${response.reason}\n\nQuestions:\n${questions.map((q) => `- ${q}`).join('\n')}\n\nRequest ID: ${response.request_id}\nPolicy Version: ${response.policy_version}`,
        },
      ],
    };
  }

  const result = await handler();
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
        return `Content published to ${channel}:\n\n${content.substring(0, 200)}...`;
      }
    );
  }
);

server.tool(
  'deploy-changes',
  'Deploy changes to production environment (HIGH RISK - typically DENIED)',
  {
    serviceName: z.string().describe('The service to deploy'),
    environment: z.enum(['staging', 'production']).describe('Target environment'),
    changes: z.string().describe('Description of changes'),
  },
  async ({ serviceName, environment, changes }) => {
    return guardedToolHandler(
      'deploy-changes',
      `Deploy ${serviceName} to ${environment}`,
      ['deploy'],
      async () => {
        return `Deployment initiated:\n- Service: ${serviceName}\n- Environment: ${environment}\n- Changes: ${changes}`;
      }
    );
  }
);

server.tool(
  'retry-workflow',
  'Retry a failing workflow (MEDIUM RISK - may DEFER if loop threshold exceeded)',
  {
    workflowId: z.string().describe('The workflow ID to retry'),
    retryCount: z.number().describe('Current retry count'),
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
    retryCount: z.number().optional().describe('Current retry count (for loop scenarios)'),
  },
  async ({ goal, sideEffects, retryCount }) => {
    const response = await stage0.checkGoal(goal, { 
      sideEffects,
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
          text: `${status}\n\nGoal: ${goal}\nSide Effects: ${sideEffects.join(', ') || 'None'}${retryCount !== undefined ? `\nRetry Count: ${retryCount}` : ''}\n\nDecision: ${response.decision}\nReason: ${response.reason}\n\nRequest ID: ${response.request_id}\nPolicy Version: ${response.policy_version}\nRisk Score: ${response.risk_score}\nHigh Risk: ${response.high_risk}`,
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