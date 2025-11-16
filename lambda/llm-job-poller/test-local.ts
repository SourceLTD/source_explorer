/**
 * Local test script for the Lambda function
 * 
 * Usage:
 *   npm run build
 *   DATABASE_URL="..." OPENAI_API_KEY="..." npx tsx test-local.ts
 */

import { handler } from './src/index';

async function test() {
  console.log('🧪 Testing Lambda function locally...\n');

  try {
    const result = await handler({}, {} as any, {} as any);
    
    console.log('\n✅ Lambda execution completed');
    console.log('Status Code:', result.statusCode);
    console.log('Response:', JSON.parse(result.body));
    
    if (result.statusCode === 200) {
      const data = JSON.parse(result.body);
      if (data.success) {
        console.log('\n📊 Statistics:');
        console.log(`  Jobs Polled: ${data.stats.jobsPolled}`);
        console.log(`  Items Polled: ${data.stats.itemsPolled}`);
        console.log(`  Items Updated: ${data.stats.itemsUpdated}`);
        console.log(`  Jobs Resolved: ${data.stats.jobsResolved.length}`);
        console.log(`  Errors: ${data.stats.errors}`);
        
        if (data.stats.jobsResolved.length > 0) {
          console.log(`  Resolved Job IDs: ${data.stats.jobsResolved.join(', ')}`);
        }
      }
    }
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

test();

