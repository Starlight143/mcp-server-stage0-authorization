import { Stage0Client } from './stage0-client.js';

async function main() {
  console.log('='.repeat(70));
  console.log('DEMO: DEFER Scenario - Unclear/Vague Request');
  console.log('='.repeat(70));
  console.log();
  console.log('Scenario: An agent receives a vague request without clear');
  console.log('success criteria or value proposition. Stage0 DEFERs to');
  console.log('request more context before proceeding.');
  console.log();

  const client = new Stage0Client();

  console.log('Calling Stage0 to check authorization...');
  console.log();

  const response = await client.checkGoal(
    '幫我想一下',
    {
      sideEffects: [],
      tools: [],
      successCriteria: [
        '有結果',
      ],
      constraints: [],
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
  
  if (response.defer_questions && response.defer_questions.length > 0) {
    console.log();
    console.log('Questions for human review:');
    for (const question of response.defer_questions) {
      console.log(`  ? ${question}`);
    }
  }

  if (response.clarifying_questions && response.clarifying_questions.length > 0) {
    console.log();
    console.log('Clarifying questions:');
    for (const question of response.clarifying_questions) {
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
    console.log('- Request is too vague to evaluate value');
    console.log('- Success criteria are unclear');
    console.log('- More context is needed before execution');
  } else if (response.verdict === 'DENY') {
    console.log('⛔ TOOL CALL BLOCKED');
    console.log();
    console.log('The request was too vague to approve.');
    console.log('Stage0 requires clearer goals and success criteria.');
    console.log();
    console.log('This demonstrates that unclear requests are not');
    console.log('blindly approved - they need proper specification.');
  } else {
    console.log('✅ TOOL CALL ALLOWED');
    console.log();
    console.log('Note: Without API key, simulated response allows this.');
    console.log('Real API would likely DEFER or DENY vague requests.');
  }

  console.log();
  console.log('='.repeat(70));
  console.log('Key Takeaway: Vague or unclear requests trigger DEFER/DENY');
  console.log('Stage0 requires clear goals, success criteria, and context');
  console.log('to provide meaningful authorization decisions.');
  console.log('='.repeat(70));
}

main().catch(console.error);