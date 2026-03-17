import { Stage0Client } from './stage0-client.js';
async function main() {
    console.log('='.repeat(70));
    console.log('DEMO: DENY Scenario - Publish Tool Call');
    console.log('='.repeat(70));
    console.log();
    console.log('Scenario: An agent attempts to publish content to a public');
    console.log('channel without proper authorization. This is a high-risk');
    console.log('operation that should be blocked.');
    console.log();
    const client = new Stage0Client();
    console.log('Calling Stage0 to check authorization...');
    console.log();
    const response = await client.checkGoal('Publish security policy update to public documentation', {
        sideEffects: ['publish'],
        tools: ['shell', 'git'],
    });
    console.log('Response from Stage0:');
    console.log('-'.repeat(70));
    console.log(`Verdict:        ${response.verdict}`);
    console.log(`Decision:       ${response.decision}`);
    console.log(`Reason:         ${response.reason}`);
    console.log(`Request ID:     ${response.request_id}`);
    console.log(`Policy Version: ${response.policy_version}`);
    console.log(`Risk Score:     ${response.risk_score}`);
    console.log(`High Risk:      ${response.high_risk}`);
    if (response.issues && response.issues.length > 0) {
        console.log();
        console.log('Issues detected:');
        for (const issue of response.issues) {
            console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
        }
    }
    console.log('-'.repeat(70));
    console.log();
    if (response.verdict === 'DENY') {
        console.log('⛔ TOOL CALL BLOCKED');
        console.log();
        console.log('The agent is NOT allowed to execute this tool.');
        console.log('This is correct because:');
        console.log('- "publish" side effect requires approval guardrails');
        console.log('- No human approval was provided');
        console.log('- Publishing without review can cause trust/compliance issues');
    }
    else {
        console.log('❌ UNEXPECTED: This should have been DENIED');
    }
    console.log();
    console.log('='.repeat(70));
    console.log('Key Takeaway: High-risk side effects are DENIED');
    console.log('Stage0 blocks actions that could create external impact');
    console.log('without proper authorization and guardrails.');
    console.log('='.repeat(70));
}
main().catch(console.error);
//# sourceMappingURL=demo-deny.js.map