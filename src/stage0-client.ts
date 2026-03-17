/**
 * Stage0 API Client for MCP Server
 *
 * This client integrates with the Stage0 runtime policy authority
 * to validate tool execution before actions are taken.
 *
 * API Endpoint: https://api.signalpulse.org/check
 */

import { config } from 'dotenv';
config();

export type Verdict = 'ALLOW' | 'DENY' | 'DEFER';
export type Decision = 'GO' | 'NO_GO' | 'DEFER' | 'ERROR';

export interface Stage0Context {
  actor_role?: string;
  user_role?: string;
  approval_status?: string;
  approved_by?: string;
  approved_at?: string;
  approval_reason?: string;
  environment?: string;
  request_channel?: string;
  run_id?: string;
  retry_count?: number;
  current_iteration?: number;
  elapsed_seconds?: number;
  current_tool?: string;
  recent_tools?: string[];
  cumulative_cost_usd?: number;
  [key: string]: unknown;
}

export interface ExecutionIntent {
  goal: string;
  success_criteria?: string[];
  constraints?: string[];
  tools?: string[];
  side_effects?: string[];
  context?: Stage0Context;
  pro?: boolean;
}

export interface PolicyResponse {
  verdict: Verdict;
  decision: Decision;
  reason: string;
  request_id: string;
  policy_version: string;
  policy_pack_version?: string;
  risk_score?: number;
  high_risk?: boolean;
  value_risk?: number;
  waste_risk?: number;
  issues?: Array<{
    code: string;
    severity: string;
    message: string;
  }>;
  guardrails?: string[];
  guardrail_checks?: Record<string, unknown>;
  clarifying_questions?: string[];
  defer_questions?: string[];
  value_findings?: string[];
  decision_trace_summary?: string;
  cached?: boolean;
  cost_estimate?: {
    currency: string;
    min: number;
    max: number;
    assumptions?: string[];
  };
}

export class Stage0Client {
  private apiKey: string;
  private baseUrl: string;
  private debug: boolean;

  constructor(options?: { apiKey?: string; baseUrl?: string; debug?: boolean }) {
    this.apiKey = options?.apiKey || process.env.STAGE0_API_KEY || '';
    this.baseUrl = options?.baseUrl || process.env.STAGE0_BASE_URL || 'https://api.signalpulse.org';
    this.debug = options?.debug || process.env.STAGE0_DEBUG === 'true';

    if (!this.apiKey) {
      console.warn('WARNING: STAGE0_API_KEY not set. Stage0 validation will be skipped.');
    }
  }

  /**
   * Check if an execution intent should be allowed.
   * Returns ALLOW, DENY, or DEFER based on the policy evaluation.
   */
  async check(intent: ExecutionIntent): Promise<PolicyResponse> {
    if (!this.apiKey) {
      return this.simulateResponse(intent);
    }

    const requestId = crypto.randomUUID();

    try {
      const response = await fetch(`${this.baseUrl}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'X-Request-Id': requestId,
        },
        body: JSON.stringify({
          goal: intent.goal,
          success_criteria: intent.success_criteria || [],
          constraints: intent.constraints || [],
          tools: intent.tools || [],
          side_effects: intent.side_effects || [],
          context: intent.context || {},
          pro: intent.pro || false,
        }),
      });

      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        return {
          verdict: 'DENY',
          decision: 'ERROR',
          reason: (data.detail as string) || `HTTP ${response.status}`,
          request_id: requestId,
          policy_version: '',
        };
      }

      return this.parseResponse(data, requestId);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (this.debug) {
        console.error('Stage0 API error:', errorMessage);
      }

      return {
        verdict: 'DENY',
        decision: 'ERROR',
        reason: `Stage0 API error: ${errorMessage}`,
        request_id: requestId,
        policy_version: '',
      };
    }
  }

  /**
   * Convenience method to check a simple goal.
   */
  async checkGoal(
    goal: string,
    options?: {
      sideEffects?: string[];
      tools?: string[];
      constraints?: string[];
      context?: Stage0Context;
    }
  ): Promise<PolicyResponse> {
    return this.check({
      goal,
      success_criteria: [],
      constraints: options?.constraints || [],
      tools: options?.tools || [],
      side_effects: options?.sideEffects || [],
      context: options?.context,
    });
  }

  private parseResponse(data: Record<string, unknown>, requestId: string): PolicyResponse {
    const verdict = this.parseVerdict(data.verdict);
    const decision = this.parseDecision(data.decision);

    let reason = data.reason as string || '';
    if (!reason && Array.isArray(data.issues)) {
      const issues = data.issues as Array<{ code?: string; message?: string }>;
      reason = issues
        .map((i) => `${i.code || 'UNKNOWN'}: ${i.message || ''}`)
        .join('; ');
    }
    if (!reason && data.decision_trace_summary) {
      reason = data.decision_trace_summary as string;
    }
    if (!reason) {
      reason = 'No reason provided';
    }

    return {
      verdict,
      decision,
      reason,
      request_id: (data.request_id as string) || requestId,
      policy_version: (data.policy_version as string) || (data.policy_pack_version as string) || '',
      policy_pack_version: data.policy_pack_version as string,
      risk_score: data.risk_score as number,
      high_risk: data.high_risk as boolean,
      value_risk: data.value_risk as number,
      waste_risk: data.waste_risk as number,
      issues: data.issues as Array<{ code: string; severity: string; message: string }>,
      guardrails: data.guardrails as string[],
      guardrail_checks: data.guardrail_checks as Record<string, unknown>,
      clarifying_questions: data.clarifying_questions as string[],
      defer_questions: data.defer_questions as string[],
      value_findings: data.value_findings as string[],
      decision_trace_summary: data.decision_trace_summary as string,
      cached: data.cached as boolean,
      cost_estimate: data.cost_estimate as {
        currency: string;
        min: number;
        max: number;
        assumptions?: string[];
      },
    };
  }

  private parseVerdict(value: unknown): Verdict {
    const str = String(value || 'DENY').toUpperCase();
    if (str === 'ALLOW' || str === 'DENY' || str === 'DEFER') {
      return str;
    }
    return 'DENY';
  }

  private parseDecision(value: unknown): Decision {
    const str = String(value || 'ERROR').toUpperCase();
    if (str === 'GO' || str === 'NO_GO' || str === 'DEFER' || str === 'ERROR') {
      return str;
    }
    return 'ERROR';
  }

  /**
   * Simulate a Stage0 response when no API key is configured.
   * This allows developers to test the integration without a real key.
   */
  private simulateResponse(intent: ExecutionIntent): PolicyResponse {
    const requestId = crypto.randomUUID();
    const sideEffects = intent.side_effects || [];

    const retryCount = intent.context?.retry_count || 0;
    
    if (sideEffects.includes('publish') || sideEffects.includes('deploy')) {
      return {
        verdict: 'DENY',
        decision: 'NO_GO',
        reason: `HIGH severity: SIDE_EFFECTS_NEED_GUARDRAILS - '${sideEffects.join(', ')}' side effect requires approval guardrails`,
        request_id: requestId,
        policy_version: 'simulated-v1.0.0',
        risk_score: 85,
        high_risk: true,
        issues: [
          {
            code: 'SIDE_EFFECTS_NEED_GUARDRAILS',
            severity: 'HIGH',
            message: `Side effects [${sideEffects.join(', ')}] require approval guardrails`,
          },
        ],
      };
    }

    if (retryCount > 3) {
      return {
        verdict: 'DEFER',
        decision: 'DEFER',
        reason: `Loop threshold reached (${retryCount} retries): human confirmation required before extending retry budget`,
        request_id: requestId,
        policy_version: 'simulated-v1.0.0',
        risk_score: 60,
        high_risk: false,
        defer_questions: [
          'Should the agent continue with additional retries?',
          'Is this workflow within the expected retry budget?',
        ],
      };
    }

    return {
      verdict: 'ALLOW',
      decision: 'GO',
      reason: 'Informational operation with no high-risk side effects',
      request_id: requestId,
      policy_version: 'simulated-v1.0.0',
      risk_score: 15,
      high_risk: false,
      guardrails: ['read_only'],
    };
  }
}

export default Stage0Client;