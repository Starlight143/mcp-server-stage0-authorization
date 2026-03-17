import { Stage0Client } from './stage0-client.js';
async function main() {
    console.log('='.repeat(70));
    console.log('DEMO: DEFER Scenario - Loop/Retry Threshold');
    console.log('='.repeat(70));
    console.log();
    console.log('Scenario: An agent has retried a failing workflow multiple times');
    console.log('and wants to continue. Stage0 DEFERs to require human review.');
    console.log();
    const client = new Stage0Client();
    console.log('Calling Stage0 to check authorization...');
    console.log();
    const response = await client.checkGoal('Continue retrying the failing support workflow', {
        sideEffects: ['loop'],
        tools: ['shell', 'api_call'],
        context: {
            run_id: 'support-workflow-2024-01-15-01',
            retry_count: 5,
        },
    });
    console.log('Response from Stage0:');
    console.log('-'.repeat(70));
    console.log(`Verdict:        ${response.verdict}`);
    console.log(`Decision:       ${response.decision}`);
    console.log(`Reason:         ${response.reason}`);
    console.log(`Request ID:     ${response.request_id}`);
    console.log(`Policy Version: ${response.policy_version}`);
    console.log(`Risk Score:     ${response.risk_score}`);
    if (response.defer_questions && response.defer_questions.length > 0) {
        console.log();
        console.log('Questions for human review:');
        for (const question of response.defer_questions) {
            console.log(`  ? ${question}`);
        }
    }
    console.log('-'.repeat(70));
    console.log();
    if (response.verdict === 'DEFER') {
        console.log('⏸️ TOOL CALL DEFERRED');
        console.log();
        console.log('The agent should NOT proceed automatically.');
        console.log('Human review is required because:');
        console.log('- Loop threshold exceeded (5 retries)');
        console.log('- Continuing could waste resources or amplify issues');
        console.log('- A human checkpoint is safer than silent continuation');
    }
    else {
        console.log('❌ UNEXPECTED: This should have been DEFERRED');
    }
    console.log();
    console.log('='.repeat(70));
    console.log('Key Takeaway: Loop-like behavior triggers DEFER');
    console.log('Stage0 catches runaway retries and requires human');
    console.log('intervention before the agent can continue unattended.');
    console.log('='.repeat(70));
}
main().catch(console.error);
//# sourceMappingURL=demo-defer.js.map