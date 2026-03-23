/**
 * Integration tests for MCP tools
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const originalApiKey = process.env.STAGE0_API_KEY;

describe('MCP Tools - Authorization Flow', () => {
  beforeAll(() => {
    delete process.env.STAGE0_API_KEY;
  });

  afterAll(() => {
    if (originalApiKey) process.env.STAGE0_API_KEY = originalApiKey;
  });

  describe('Tool categorization', () => {
    it('research-topic should be categorized as LOW risk', async () => {
      const { Stage0Client } = await import('../src/stage0-client.js');
      const client = new Stage0Client({ apiKey: '' });

      const response = await client.checkGoal(
        'Research Python web frameworks and provide summary',
        {
          sideEffects: [],
          tools: ['web_search', 'read_file'],
          successCriteria: ['Summary is accurate'],
          constraints: ['read-only'],
        }
      );

      expect(response.verdict).toBe('ALLOW');
      expect(response.high_risk).toBe(false);
    });

    it('publish-content should be categorized as HIGH risk', async () => {
      const { Stage0Client } = await import('../src/stage0-client.js');
      const client = new Stage0Client({ apiKey: '' });

      const response = await client.checkGoal(
        'Publish article to blog',
        {
          sideEffects: ['publish'],
          tools: ['shell', 'git'],
          successCriteria: ['Article published'],
        }
      );

      expect(response.verdict).toBe('DENY');
      expect(response.high_risk).toBe(true);
    });

    it('deploy-changes should be categorized as HIGH risk', async () => {
      const { Stage0Client } = await import('../src/stage0-client.js');
      const client = new Stage0Client({ apiKey: '' });

      const response = await client.checkGoal(
        'Deploy service to production',
        {
          sideEffects: ['deploy'],
          tools: ['kubectl', 'shell'],
          successCriteria: ['Deployment successful'],
        }
      );

      expect(response.verdict).toBe('DENY');
      expect(response.high_risk).toBe(true);
    });

    it('retry-workflow should respect loop threshold', async () => {
      const { Stage0Client } = await import('../src/stage0-client.js');
      const client = new Stage0Client({ apiKey: '' });

      const belowThreshold = await client.checkGoal(
        'Retry workflow',
        {
          sideEffects: ['loop'],
          successCriteria: ['Workflow completes'],
          context: { retry_count: 2 },
        }
      );

      const atThreshold = await client.checkGoal(
        'Retry workflow',
        {
          sideEffects: ['loop'],
          successCriteria: ['Workflow completes'],
          context: { retry_count: 5 },
        }
      );

      const aboveThreshold = await client.checkGoal(
        'Retry workflow',
        {
          sideEffects: ['loop'],
          successCriteria: ['Workflow completes'],
          context: { retry_count: 6 },
        }
      );

      expect(belowThreshold.verdict).toBe('ALLOW');
      expect(atThreshold.verdict).toBe('DEFER');
      expect(aboveThreshold.verdict).toBe('DEFER');
    });
  });

  describe('Blocked response structure', () => {
    it('should include request_id and policy_version in DENY response', async () => {
      const { Stage0Client } = await import('../src/stage0-client.js');
      const client = new Stage0Client({ apiKey: '' });

      const response = await client.checkGoal(
        'Publish content',
        {
          sideEffects: ['publish'],
          successCriteria: ['Content published'],
        }
      );

      expect(response.verdict).toBe('DENY');
      expect(response.request_id).toBeDefined();
      expect(response.policy_version).toBeDefined();
      expect(response.reason).toBeDefined();
      expect(response.reason.length).toBeGreaterThan(0);
    });

    it('should include clarifying questions in DEFER response', async () => {
      const { Stage0Client } = await import('../src/stage0-client.js');
      const client = new Stage0Client({ apiKey: '' });

      const response = await client.checkGoal(
        '幫我想一下',
        {
          sideEffects: [],
          successCriteria: ['有結果'],
        }
      );

      expect(response.verdict).toBe('DEFER');
      expect(
        response.defer_questions || response.clarifying_questions
      ).toBeDefined();
    });
  });
});

describe('Guarded Tool Handler Behavior', () => {
  it('should not execute handler when DENIED', async () => {
    const { Stage0Client } = await import('../src/stage0-client.js');
    const client = new Stage0Client({ apiKey: '' });

    const handlerCallCount = { value: 0 };
    
    const mockHandler = async () => {
      handlerCallCount.value++;
      return 'Handler executed';
    };

    const response = await client.checkGoal(
      'Deploy to production',
      {
        sideEffects: ['deploy'],
        successCriteria: ['Deployment successful'],
      }
    );

    expect(response.verdict).toBe('DENY');
    expect(handlerCallCount.value).toBe(0);
  });

  it('should provide structured error with issues array', async () => {
    const { Stage0Client } = await import('../src/stage0-client.js');
    const client = new Stage0Client({ apiKey: '' });

    const response = await client.checkGoal(
      'Publish to production',
      {
        sideEffects: ['publish', 'external_notification'],
        successCriteria: ['Published and notified'],
      }
    );

    expect(response.issues).toBeDefined();
    expect(Array.isArray(response.issues)).toBe(true);
    expect(response.issues!.length).toBeGreaterThan(0);
    
    for (const issue of response.issues!) {
      expect(issue.code).toBeDefined();
      expect(issue.severity).toBeDefined();
      expect(issue.message).toBeDefined();
    }
  });
});

describe('Context propagation', () => {
  it('should pass retry_count in loop scenarios', async () => {
    const { Stage0Client } = await import('../src/stage0-client.js');
    const client = new Stage0Client({ apiKey: '' });

    const response = await client.checkGoal(
      'Retry workflow',
      {
        sideEffects: ['loop'],
        successCriteria: ['Workflow completes'],
        context: {
          retry_count: 10,
          run_id: 'test-run-123',
        },
      }
    );

    expect(response.verdict).toBe('DEFER');
    expect(response.reason).toContain('LOOP_THRESHOLD_EXCEEDED');
  });

  it('should accept all context fields without error', async () => {
    const { Stage0Client } = await import('../src/stage0-client.js');
    const client = new Stage0Client({ apiKey: '' });

    const context = {
      actor_role: 'admin',
      approval_status: 'approved',
      environment: 'production',
      resource_scope: 'all',
    };

    const response = await client.checkGoal(
      'Read configuration',
      {
        sideEffects: [],
        successCriteria: ['Config read'],
        context,
      }
    );

    expect(response).toBeDefined();
    expect(response.request_id).toBeDefined();
  });
});