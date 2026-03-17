/**
 * Stage0 API Client for MCP Server
 *
 * This client integrates with the Stage0 runtime policy authority
 * to validate tool execution before actions are taken.
 *
 * API Endpoint: https://api.signalpulse.org/check
 */
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
export declare class Stage0Client {
    private apiKey;
    private baseUrl;
    private debug;
    constructor(options?: {
        apiKey?: string;
        baseUrl?: string;
        debug?: boolean;
    });
    /**
     * Check if an execution intent should be allowed.
     * Returns ALLOW, DENY, or DEFER based on the policy evaluation.
     */
    check(intent: ExecutionIntent): Promise<PolicyResponse>;
    /**
     * Convenience method to check a simple goal.
     */
    checkGoal(goal: string, options?: {
        sideEffects?: string[];
        tools?: string[];
        constraints?: string[];
        successCriteria?: string[];
        context?: Stage0Context;
        pro?: boolean;
    }): Promise<PolicyResponse>;
    private parseResponse;
    private parseVerdict;
    private parseDecision;
    /**
     * Simulate a Stage0 response when no API key is configured.
     * This allows developers to test the integration without a real key.
     */
    private simulateResponse;
}
export default Stage0Client;
//# sourceMappingURL=stage0-client.d.ts.map