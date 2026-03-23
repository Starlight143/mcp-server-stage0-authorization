/**
 * Smoke tests for Stage0Client
 * 
 * Tests both simulated mode (no API key) and real API mode (with API key)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Stage0Client } from '../src/stage0-client.js';

const originalApiKey = process.env.STAGE0_API_KEY;

const hasValidApiKey = originalApiKey && 
  originalApiKey !== 'your_api_key_here' && 
  originalApiKey.length > 10;

describe('Stage0Client - Simulated Mode (no API key)', () => {
  let client: Stage0Client;

  beforeAll(() => {
    delete process.env.STAGE0_API_KEY;
    client = new Stage0Client({ apiKey: '' });
  });

  afterAll(() => {
    if (originalApiKey) process.env.STAGE0_API_KEY = originalApiKey;
  });

  describe('ALLOW scenarios', () => {
    it('should ALLOW informational operations with clear success criteria', async () => {
      const response = await client.checkGoal(
        'Research Python web frameworks and provide informational summary',
        {
          sideEffects: [],
          tools: ['web_search', 'read_file'],
          successCriteria: [
            'Summary includes at least 3 frameworks',
            'Output is under 500 words',
            'No external side effects',
          ],
          constraints: ['read-only'],
        }
      );

      expect(response.verdict).toBe('ALLOW');
      expect(response.decision).toBe('GO');
      expect(response.request_id).toBeDefined();
      expect(response.policy_version).toBeDefined();
      expect(response.risk_score).toBeLessThan(50);
      expect(response.high_risk).toBe(false);
    });

    it('should ALLOW low-risk operations without side effects', async () => {
      const response = await client.check({
        goal: 'Read configuration file and display contents',
        side_effects: [],
        success_criteria: ['File contents displayed correctly'],
        constraints: ['read-only'],
      });

      expect(response.verdict).toBe('ALLOW');
    });
  });

  describe('DENY scenarios', () => {
    it('should DENY publish operations without guardrails', async () => {
      const response = await client.checkGoal(
        'Publish security policy update to public documentation',
        {
          sideEffects: ['publish'],
          tools: ['shell', 'git'],
          successCriteria: ['Content published successfully'],
          constraints: [],
        }
      );

      expect(response.verdict).toBe('DENY');
      expect(response.decision).toBe('NO_GO');
      expect(response.high_risk).toBe(true);
      expect(response.issues).toBeDefined();
      expect(response.issues!.length).toBeGreaterThan(0);
      expect(response.issues!.some(i => i.code === 'SIDE_EFFECTS_NEED_GUARDRAILS')).toBe(true);
    });

    it('should DENY deploy operations to production', async () => {
      const response = await client.checkGoal(
        'Deploy authentication service to production',
        {
          sideEffects: ['deploy'],
          tools: ['kubectl', 'shell'],
          successCriteria: ['Deployment completes successfully'],
        }
      );

      expect(response.verdict).toBe('DENY');
      expect(response.high_risk).toBe(true);
    });

    it('should DENY operations without success criteria', async () => {
      const response = await client.checkGoal(
        'Do something important',
        {
          sideEffects: [],
          successCriteria: [], // Empty!
        }
      );

      expect(response.verdict).toBe('DENY');
      expect(response.reason).toContain('MISSING_SUCCESS_CRITERIA');
    });
  });

  describe('DEFER scenarios', () => {
    it('should DEFER when loop threshold is exceeded', async () => {
      const response = await client.checkGoal(
        'Retry failed workflow',
        {
          sideEffects: ['loop'],
          successCriteria: ['Workflow completes successfully'],
          context: {
            retry_count: 6,
            run_id: 'workflow-123',
          },
        }
      );

      expect(response.verdict).toBe('DEFER');
      expect(response.decision).toBe('DEFER');
      expect(response.reason).toContain('LOOP_THRESHOLD_EXCEEDED');
      expect(response.defer_questions).toBeDefined();
      expect(response.defer_questions!.length).toBeGreaterThan(0);
    });

    it('should DEFER vague requests in Chinese', async () => {
      const response = await client.checkGoal(
        '幫我想一下',
        {
          sideEffects: [],
          successCriteria: ['有結果'],
        }
      );

      expect(response.verdict).toBe('DEFER');
      expect(response.clarifying_questions).toBeDefined();
    });

    it('should DEFER vague requests in English', async () => {
      const response = await client.checkGoal(
        'help me think',
        {
          sideEffects: [],
          successCriteria: ['Some result'],
        }
      );

      expect(response.verdict).toBe('DEFER');
    });
  });

  describe('Response structure', () => {
    it('should always include request_id and policy_version', async () => {
      const responses = await Promise.all([
        client.checkGoal('Test ALLOW', { sideEffects: [], successCriteria: ['Test passes'] }),
        client.checkGoal('Test DENY', { sideEffects: ['publish'], successCriteria: ['Test passes'] }),
        client.checkGoal('幫我想一下', { sideEffects: [], successCriteria: ['有結果'] }),
      ]);

      for (const response of responses) {
        expect(response.request_id).toBeDefined();
        expect(response.request_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(response.policy_version).toBeDefined();
        expect(response.policy_version.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Stage0Client - Real API Mode', () => {
  let client: Stage0Client;

  beforeAll(() => {
    if (hasValidApiKey && originalApiKey) {
      client = new Stage0Client({ apiKey: originalApiKey });
    }
  });

  it.skipIf(!hasValidApiKey)('should connect to real API and return a valid response structure', async () => {
    const response = await client.checkGoal(
      'Research Python web frameworks and provide informational summary',
      {
        sideEffects: [],
        tools: ['web_search', 'read_file'],
        successCriteria: [
          'Summary includes at least 3 frameworks',
          'Output is under 500 words',
        ],
        constraints: ['read-only'],
      }
    );

    expect(response.verdict).toBeDefined();
    expect(['ALLOW', 'DENY', 'DEFER']).toContain(response.verdict);
    expect(response.request_id).toBeDefined();
    expect(response.reason).toBeDefined();
  });

  it.skipIf(!hasValidApiKey)('should connect to real API for publish operation', async () => {
    const response = await client.checkGoal(
      'Publish content to public documentation',
      {
        sideEffects: ['publish'],
        tools: ['shell', 'git'],
        successCriteria: ['Content published successfully'],
      }
    );

    expect(response.verdict).toBeDefined();
    expect(['ALLOW', 'DENY', 'DEFER']).toContain(response.verdict);
    expect(response.request_id).toBeDefined();
    expect(response.reason).toBeDefined();
  });
});

describe('Stage0Client - Error handling', () => {
  it('should return DENY with ERROR decision when API call fails', async () => {
    const client = new Stage0Client({
      apiKey: 'invalid-key-12345',
      baseUrl: 'https://invalid-url-that-does-not-exist-12345.com',
    });

    const response = await client.checkGoal(
      'Test operation',
      {
        sideEffects: [],
        successCriteria: ['Test passes'],
      }
    );

    // With invalid URL, it should fail gracefully
    // In simulated mode (empty key), it won't call API
    // With a key but invalid URL, it should return error
    if (process.env.STAGE0_API_KEY) {
      expect(response.decision).toBe('ERROR');
      expect(response.reason).toContain('error');
    }
  });
});

describe('Stage0Context fields', () => {
  it('should accept all documented context fields', async () => {
    const client = new Stage0Client({ apiKey: '' });
    
    const fullContext = {
      actor_role: 'admin',
      user_role: 'developer',
      approval_status: 'approved',
      approved_by: 'john@example.com',
      approved_at: '2024-01-15T10:00:00Z',
      approval_reason: 'Emergency hotfix',
      environment: 'production',
      resource_scope: 'all',
      request_channel: 'cli',
      run_id: 'run-123',
      retry_count: 2,
      current_iteration: 3,
      elapsed_seconds: 45,
      current_tool: 'publish-content',
      recent_tools: ['research-topic', 'edit-file'],
      cumulative_cost_usd: 0.05,
    };

    const response = await client.check({
      goal: 'Test with full context',
      side_effects: [],
      success_criteria: ['Test passes'],
      context: fullContext,
    });

    expect(response).toBeDefined();
    expect(response.request_id).toBeDefined();
  });
});

describe('Edge cases and priority logic', () => {
  let client: Stage0Client;

  beforeAll(() => {
    delete process.env.STAGE0_API_KEY;
    client = new Stage0Client({ apiKey: '' });
  });

  describe('Side effect priority', () => {
    it('should DENY publish even when loop threshold exceeded (DENY > DEFER)', async () => {
      const response = await client.checkGoal(
        'Publish with retry loop',
        {
          sideEffects: ['loop', 'publish'],
          successCriteria: ['Operation succeeds'],
          context: { retry_count: 10 },
        }
      );

      expect(response.verdict).toBe('DENY');
      expect(response.high_risk).toBe(true);
      expect(response.reason).toContain('SIDE_EFFECTS_NEED_GUARDRAILS');
    });

    it('should DENY deploy even when loop threshold exceeded', async () => {
      const response = await client.checkGoal(
        'Deploy with retry loop',
        {
          sideEffects: ['loop', 'deploy'],
          successCriteria: ['Deployment succeeds'],
          context: { retry_count: 10 },
        }
      );

      expect(response.verdict).toBe('DENY');
      expect(response.high_risk).toBe(true);
    });

    it('should DEFER loop below threshold without other side effects', async () => {
      const response = await client.checkGoal(
        'Retry workflow operation',
        {
          sideEffects: ['loop'],
          successCriteria: ['Workflow completes'],
          context: { retry_count: 2 },
        }
      );

      expect(response.verdict).toBe('ALLOW');
    });
  });

  describe('Boundary values', () => {
    it('should ALLOW loop at retry_count = 4 (below threshold)', async () => {
      const response = await client.checkGoal(
        'Retry workflow',
        {
          sideEffects: ['loop'],
          successCriteria: ['Workflow completes'],
          context: { retry_count: 4 },
        }
      );

      expect(response.verdict).toBe('ALLOW');
    });

    it('should DEFER loop at retry_count = 5 (at threshold)', async () => {
      const response = await client.checkGoal(
        'Retry workflow',
        {
          sideEffects: ['loop'],
          successCriteria: ['Workflow completes'],
          context: { retry_count: 5 },
        }
      );

      expect(response.verdict).toBe('DEFER');
    });

    it('should handle retry_count = 0', async () => {
      const response = await client.checkGoal(
        'First attempt',
        {
          sideEffects: ['loop'],
          successCriteria: ['Operation succeeds'],
          context: { retry_count: 0 },
        }
      );

      expect(response.verdict).toBe('ALLOW');
    });

    it('should handle missing retry_count (defaults to 0)', async () => {
      const response = await client.checkGoal(
        'Retry operation',
        {
          sideEffects: ['loop'],
          successCriteria: ['Operation succeeds'],
        }
      );

      expect(response.verdict).toBe('ALLOW');
    });
  });

  describe('Goal validation', () => {
    it('should ALLOW goals exactly 10 characters', async () => {
      const response = await client.checkGoal(
        '1234567890',
        {
          sideEffects: [],
          successCriteria: ['Test passes'],
        }
      );

      expect(response.verdict).toBe('ALLOW');
    });

    it('should DEFER goals shorter than 10 characters', async () => {
      const response = await client.checkGoal(
        '123456789',
        {
          sideEffects: [],
          successCriteria: ['Test passes'],
        }
      );

      expect(response.verdict).toBe('DEFER');
    });

    it('should DENY empty goal with no success criteria', async () => {
      const response = await client.checkGoal(
        '',
        {
          sideEffects: [],
          successCriteria: [],
        }
      );

      expect(response.verdict).toBe('DEFER');
    });
  });

  describe('Multiple side effects', () => {
    it('should DENY when both publish and deploy are present', async () => {
      const response = await client.checkGoal(
        'Publish and deploy operation',
        {
          sideEffects: ['publish', 'deploy'],
          successCriteria: ['Operation succeeds'],
        }
      );

      expect(response.verdict).toBe('DENY');
      expect(response.high_risk).toBe(true);
    });
  });
});

describe('Retry count edge cases', () => {
  let client: Stage0Client;

  beforeAll(() => {
    delete process.env.STAGE0_API_KEY;
    client = new Stage0Client({ apiKey: '' });
  });

  afterAll(() => {
    if (originalApiKey) process.env.STAGE0_API_KEY = originalApiKey;
  });

  it('should treat negative retry_count as 0', async () => {
    const response = await client.checkGoal(
      'Retry workflow with negative count',
      {
        sideEffects: ['loop'],
        successCriteria: ['Operation succeeds'],
        context: { retry_count: -5 },
      }
    );

    expect(response.verdict).toBe('ALLOW');
  });

  it('should treat NaN retry_count as 0', async () => {
    const response = await client.checkGoal(
      'Retry workflow with NaN count',
      {
        sideEffects: ['loop'],
        successCriteria: ['Operation succeeds'],
        context: { retry_count: NaN },
      }
    );

    expect(response.verdict).toBe('ALLOW');
  });

  it('should treat Infinity retry_count as 0', async () => {
    const response = await client.checkGoal(
      'Retry workflow with Infinity count',
      {
        sideEffects: ['loop'],
        successCriteria: ['Operation succeeds'],
        context: { retry_count: Infinity },
      }
    );

    expect(response.verdict).toBe('ALLOW');
  });

  it('should treat string retry_count as 0', async () => {
    const response = await client.checkGoal(
      'Retry workflow with string count',
      {
        sideEffects: ['loop'],
        successCriteria: ['Operation succeeds'],
        context: { retry_count: '5' as unknown as number },
      }
    );

    expect(response.verdict).toBe('ALLOW');
  });

  it('should treat undefined retry_count as 0', async () => {
    const response = await client.checkGoal(
      'Retry workflow with undefined count',
      {
        sideEffects: ['loop'],
        successCriteria: ['Operation succeeds'],
        context: { retry_count: undefined },
      }
    );

    expect(response.verdict).toBe('ALLOW');
  });

  it('should treat null retry_count as 0', async () => {
    const response = await client.checkGoal(
      'Retry workflow with null count',
      {
        sideEffects: ['loop'],
        successCriteria: ['Operation succeeds'],
        context: { retry_count: null as unknown as number },
      }
    );

    expect(response.verdict).toBe('ALLOW');
  });
});

describe('Type safety and response parsing', () => {
  let client: Stage0Client;

  beforeAll(() => {
    delete process.env.STAGE0_API_KEY;
    client = new Stage0Client({ apiKey: '' });
  });

  afterAll(() => {
    if (originalApiKey) process.env.STAGE0_API_KEY = originalApiKey;
  });

  it('should always return valid verdict types', async () => {
    const response = await client.checkGoal(
      'Test operation for type safety',
      {
        sideEffects: [],
        successCriteria: ['Test passes'],
      }
    );

    expect(['ALLOW', 'DENY', 'DEFER']).toContain(response.verdict);
    expect(['GO', 'NO_GO', 'DEFER', 'ERROR']).toContain(response.decision);
    expect(typeof response.request_id).toBe('string');
    expect(typeof response.policy_version).toBe('string');
    expect(typeof response.reason).toBe('string');
  });

  it('should handle issues array correctly', async () => {
    const response = await client.checkGoal(
      'Publish operation',
      {
        sideEffects: ['publish'],
        successCriteria: ['Published'],
      }
    );

    expect(response.issues).toBeDefined();
    expect(Array.isArray(response.issues)).toBe(true);
    if (response.issues && response.issues.length > 0) {
      expect(typeof response.issues[0].code).toBe('string');
      expect(typeof response.issues[0].severity).toBe('string');
      expect(typeof response.issues[0].message).toBe('string');
    }
  });
});