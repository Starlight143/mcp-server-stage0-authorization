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
  resource_scope?: string;
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
    this.apiKey = options?.apiKey ?? process.env.STAGE0_API_KEY ?? '';
    this.baseUrl = options?.baseUrl ?? process.env.STAGE0_BASE_URL ?? 'https://api.signalpulse.org';
    this.debug = options?.debug ?? process.env.STAGE0_DEBUG === 'true';

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
        const errorMsg = (data.message as string) || 
                         (data.error as string) || 
                         (data.detail as string) || 
                         `HTTP ${response.status}`;
        return {
          verdict: 'DENY',
          decision: 'ERROR',
          reason: errorMsg,
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
      successCriteria?: string[];
      context?: Stage0Context;
      pro?: boolean;
    }
  ): Promise<PolicyResponse> {
    return this.check({
      goal,
      success_criteria: options?.successCriteria || [],
      constraints: options?.constraints || [],
      tools: options?.tools || [],
      side_effects: options?.sideEffects || [],
      context: options?.context,
      pro: options?.pro || false,
    });
  }

  private parseResponse(data: Record<string, unknown>, requestId: string): PolicyResponse {
    const verdict = this.parseVerdict(data.verdict);
    const decision = this.parseDecision(data.decision);

    let reason = typeof data.reason === 'string' ? data.reason : '';
    if (!reason && Array.isArray(data.issues)) {
      reason = data.issues
        .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
        .map((i) => `${String(i.code ?? 'UNKNOWN')}: ${String(i.message ?? '')}`)
        .join('; ');
    }
    if (!reason && typeof data.decision_trace_summary === 'string') {
      reason = data.decision_trace_summary;
    }
    if (!reason) {
      reason = 'No reason provided';
    }

    return {
      verdict,
      decision,
      reason,
      request_id: typeof data.request_id === 'string' ? data.request_id : requestId,
      policy_version: typeof data.policy_version === 'string' 
        ? data.policy_version 
        : typeof data.policy_pack_version === 'string' 
          ? data.policy_pack_version 
          : '',
      policy_pack_version: typeof data.policy_pack_version === 'string' ? data.policy_pack_version : undefined,
      risk_score: typeof data.risk_score === 'number' ? data.risk_score : undefined,
      high_risk: typeof data.high_risk === 'boolean' ? data.high_risk : undefined,
      value_risk: typeof data.value_risk === 'number' ? data.value_risk : undefined,
      waste_risk: typeof data.waste_risk === 'number' ? data.waste_risk : undefined,
      issues: this.parseIssues(data.issues),
      guardrails: Array.isArray(data.guardrails) ? data.guardrails.filter((g): g is string => typeof g === 'string') : undefined,
      guardrail_checks: typeof data.guardrail_checks === 'object' && data.guardrail_checks !== null 
        ? data.guardrail_checks as Record<string, unknown> 
        : undefined,
      clarifying_questions: this.parseStringArray(data.clarifying_questions),
      defer_questions: this.parseStringArray(data.defer_questions),
      value_findings: this.parseStringArray(data.value_findings),
      decision_trace_summary: typeof data.decision_trace_summary === 'string' ? data.decision_trace_summary : undefined,
      cached: typeof data.cached === 'boolean' ? data.cached : undefined,
      cost_estimate: this.parseCostEstimate(data.cost_estimate),
    };
  }

  private parseIssues(value: unknown): Array<{ code: string; severity: string; message: string }> | undefined {
    if (!Array.isArray(value)) return undefined;
    return value
      .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
      .map((i) => ({
        code: String(i.code ?? 'UNKNOWN'),
        severity: String(i.severity ?? 'UNKNOWN'),
        message: String(i.message ?? ''),
      }));
  }

  private parseStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const result = value.filter((s): s is string => typeof s === 'string');
    return result.length > 0 ? result : undefined;
  }

  private parseCostEstimate(value: unknown): PolicyResponse['cost_estimate'] {
    if (typeof value !== 'object' || value === null) return undefined;
    const estimate = value as Record<string, unknown>;
    if (typeof estimate.currency !== 'string' || typeof estimate.min !== 'number' || typeof estimate.max !== 'number') {
      return undefined;
    }
    return {
      currency: estimate.currency,
      min: estimate.min,
      max: estimate.max,
      assumptions: Array.isArray(estimate.assumptions) 
        ? estimate.assumptions.filter((a): a is string => typeof a === 'string') 
        : undefined,
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
    const successCriteria = intent.success_criteria || [];
    const goal = intent.goal || '';
    
    // Check high-risk side effects first (DENY takes precedence over DEFER)
    if (sideEffects.includes('publish') || sideEffects.includes('deploy')) {
      return {
        verdict: 'DENY',
        decision: 'NO_GO',
        reason: `SIDE_EFFECTS_NEED_GUARDRAILS: External/irreversible side effects declared without machine-readable guardrails in constraints.`,
        request_id: requestId,
        policy_version: 'simulated-v1.0.0',
        risk_score: 64,
        high_risk: true,
        issues: [
          {
            code: 'SIDE_EFFECTS_NEED_GUARDRAILS',
            severity: 'HIGH',
            message: `Side effects [${sideEffects.join(', ')}] require approval guardrails`,
          },
          {
            code: 'CUSTOMER_VISIBLE_APPROVAL_REQUIRED',
            severity: 'LOW',
            message: 'Customer-visible side effects require explicit approval before execution',
          },
        ],
      };
    }

    // Handle loop side effects (retry scenarios)
    if (sideEffects.includes('loop')) {
      const rawRetryCount = intent.context?.retry_count;
      const retryCount = typeof rawRetryCount === 'number' && Number.isFinite(rawRetryCount) && rawRetryCount >= 0
        ? rawRetryCount 
        : 0;
      const maxRetries = 5;
      
      if (retryCount >= maxRetries) {
        return {
          verdict: 'DEFER',
          decision: 'DEFER',
          reason: `LOOP_THRESHOLD_EXCEEDED: Retry count (${retryCount}) exceeds maximum allowed (${maxRetries}). Consider alternative approaches or human review.`,
          request_id: requestId,
          policy_version: 'simulated-v1.0.0',
          risk_score: 45,
          high_risk: false,
          issues: [
            {
              code: 'LOOP_THRESHOLD_EXCEEDED',
              severity: 'MEDIUM',
              message: `Retry count ${retryCount} exceeds threshold of ${maxRetries}`,
            },
          ],
          defer_questions: [
            'Should we continue retrying or try a different approach?',
            'Is there a root cause that needs to be addressed first?',
          ],
        };
      }
    }

    const isVagueGoal = goal.length < 10 || 
      goal.includes('幫我') || 
      goal.includes('想一下') ||
      goal.toLowerCase().includes('help me') ||
      goal.toLowerCase().includes('think');

    if (isVagueGoal) {
      return {
        verdict: 'DEFER',
        decision: 'DEFER',
        reason: `UNCLEAR_VALUE_SIGNAL: Task appears under-specified for reliable value delivery.`,
        request_id: requestId,
        policy_version: 'simulated-v1.0.0',
        risk_score: 35,
        high_risk: false,
        issues: [
          {
            code: 'UNCLEAR_VALUE_SIGNAL',
            severity: 'MEDIUM',
            message: 'Task scope/goal quality suggests low expected value at current definition',
          },
        ],
        clarifying_questions: [
          'What is the specific outcome you want to achieve?',
          'What constraints or requirements should be considered?',
        ],
      };
    }

    if (successCriteria.length === 0) {
      return {
        verdict: 'DENY',
        decision: 'NO_GO',
        reason: `MISSING_SUCCESS_CRITERIA: Provide at least one success criterion.`,
        request_id: requestId,
        policy_version: 'simulated-v1.0.0',
        risk_score: 59,
        high_risk: false,
        issues: [
          {
            code: 'MISSING_SUCCESS_CRITERIA',
            severity: 'HIGH',
            message: 'Provide at least one success criterion',
          },
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