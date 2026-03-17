import { Stage0Client } from './stage0-client.js';

async function main() {
  console.log('='.repeat(70));
  console.log('DEMO: ALLOW Scenario - Research Tool Call');
  console.log('='.repeat(70));
  console.log();
  console.log('Scenario: An agent wants to research a topic and return');
  console.log('informational summary. This is a low-risk operation.');
  console.log();

  const client = new Stage0Client();

  console.log('Calling Stage0 to check authorization...');
  console.log();

  const response = await client.checkGoal(
    'Research Python web frameworks and provide informational summary',
    {
      sideEffects: [],
      tools: ['web_search', 'read_file'],
    }
  );

  console.log('Response from Stage0:');
  console.log('-'.repeat(70));
  console.log(`Verdict:        ${response.verdict}`);
  console.log(`Decision:       ${response.decision}`);
  console.log(`Reason:         ${response.reason}`);
  console.log(`Request ID:     ${response.request_id}`);
  console.log(`Policy Version: ${response.policy_version}`);
  console.log(`Risk Score:     ${response.risk_score}`);
  console.log(`High Risk:      ${response.high_risk}`);
  console.log('-'.repeat(70));
  console.log();

  if (response.verdict === 'ALLOW') {
    console.log('✅ TOOL CALL ALLOWED');
    console.log();
    console.log('The agent can proceed to execute the research tool.');
    console.log('This is safe because:');
    console.log('- No side effects (publish, deploy, etc.)');
    console.log('- Informational operation only');
    console.log('- No guardrail violations');
  } else {
    console.log('❌ UNEXPECTED: This should have been ALLOWED');
  }

  console.log();
  console.log('='.repeat(70));
  console.log('Key Takeaway: Informational operations are ALLOWED');
  console.log('Stage0 allows safe, bounded assistance without blocking');
  console.log('legitimate research and analysis tasks.');
  console.log('='.repeat(70));
}

main().catch(console.error);