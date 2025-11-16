/**
 * Local test script for lambda job submission functionality
 * 
 * Usage:
 *   DATABASE_URL="..." OPENAI_API_KEY="..." npx tsx test-submission.ts
 */

import { handler } from './src/index';

async function test() {
  console.log('Testing Lambda job submission and polling...\n');

  // Simulate a Lambda event
  const event = {
    chainDepth: 0,
  };

  const context = {
    functionName: 'llm-job-poller-test',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:llm-job-poller-test',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/llm-job-poller-test',
    logStreamName: '2024/01/01/[$LATEST]test',
    getRemainingTimeInMillis: () => 300000,
  } as any;

  try {
    const result = await handler(event, context, () => {});
    console.log('\n=== Lambda Result ===');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.statusCode === 200) {
      const body = JSON.parse(result.body);
      console.log('\n=== Stats Summary ===');
      console.log(`Submitted: ${body.stats.itemsSubmitted}`);
      console.log(`Failed: ${body.stats.itemsFailed}`);
      console.log(`Polled: ${body.stats.itemsPolled}`);
      console.log(`Updated: ${body.stats.itemsUpdated}`);
      console.log(`Jobs Resolved: ${body.stats.jobsResolved.length}`);
      console.log(`Pending Remaining: ${body.pendingRemaining}`);
    }
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }

  console.log('\nTest complete!');
  process.exit(0);
}

test();

