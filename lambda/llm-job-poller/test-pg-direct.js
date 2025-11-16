const { Client } = require('pg');

async function test() {
  const connectionString = "postgresql://postgres.txyvapnclxnwpiifbxmu:kxzk8RS0q29BNNrN@aws-1-eu-west-2.pooler.supabase.com:6543/postgres";
  
  console.log('🔍 Testing direct pg connection...\n');
  
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Connection successful!\n');
    
    const result = await client.query('SELECT COUNT(*) as count FROM llm_jobs');
    console.log(`✅ Query successful! Found ${result.rows[0].count} jobs\n`);
    
    await client.end();
  } catch (error) {
    console.log(`❌ Failed: ${error.message}\n`);
  }
}

test();
