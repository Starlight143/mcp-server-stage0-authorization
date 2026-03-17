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
export class Stage0Client {
    apiKey;
    baseUrl;
    debug;
    constructor(options) {
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
    async check(intent) {
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
            const data = await response.json();
            if (!response.ok) {
                return {
                    verdict: 'DENY',
                    decision: 'ERROR',
                    reason: data.detail || `HTTP ${response.status}`,
                    request_id: requestId,
                    policy_version: '',
                };
            }
            return this.parseResponse(data, requestId);
        }
        catch (error) {
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
    async checkGoal(goal, options) {
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
    parseResponse(data, requestId) {
        const verdict = this.parseVerdict(data.verdict);
        const decision = this.parseDecision(data.decision);
        let reason = data.reason || '';
        if (!reason && Array.isArray(data.issues)) {
            const issues = data.issues;
            reason = issues
                .map((i) => `${i.code || 'UNKNOWN'}: ${i.message || ''}`)
                .join('; ');
        }
        if (!reason && data.decision_trace_summary) {
            reason = data.decision_trace_summary;
        }
        if (!reason) {
            reason = 'No reason provided';
        }
        return {
            verdict,
            decision,
            reason,
            request_id: data.request_id || requestId,
            policy_version: data.policy_version || data.policy_pack_version || '',
            policy_pack_version: data.policy_pack_version,
            risk_score: data.risk_score,
            high_risk: data.high_risk,
            value_risk: data.value_risk,
            waste_risk: data.waste_risk,
            issues: data.issues,
            guardrails: data.guardrails,
            guardrail_checks: data.guardrail_checks,
            clarifying_questions: data.clarifying_questions,
            defer_questions: data.defer_questions,
            value_findings: data.value_findings,
            decision_trace_summary: data.decision_trace_summary,
            cached: data.cached,
            cost_estimate: data.cost_estimate,
        };
    }
    parseVerdict(value) {
        const str = String(value || 'DENY').toUpperCase();
        if (str === 'ALLOW' || str === 'DENY' || str === 'DEFER') {
            return str;
        }
        return 'DENY';
    }
    parseDecision(value) {
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
    simulateResponse(intent) {
        const requestId = crypto.randomUUID();
        const sideEffects = intent.side_effects || [];
        const successCriteria = intent.success_criteria || [];
        const goal = intent.goal || '';
        // Handle loop side effects (retry scenarios)
        if (sideEffects.includes('loop')) {
            const retryCount = intent.context?.retry_count || 0;
            const maxRetries = 5; // Default threshold
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
//# sourceMappingURL=stage0-client.js.map