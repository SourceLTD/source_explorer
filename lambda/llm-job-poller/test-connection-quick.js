const { Client } = require('pg');

async function test() {
  const connectionString = "postgresql://postgres:kxzk8RS0q29BNNrN@db.txyvapnclxnwpiifbxmu.supabase.co:5432/postgres";
  
  console.log('🔍 Testing new connection string...\n');
  console.log(`   URL: ${connectionString.replace(/:[^:]*@/, ':****@')}\n`);
  
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Connection successful!');
    
    const result = await client.query('SELECT COUNT(*) as count FROM llm_jobs');
    console.log(`✅ Query successful! Found ${result.rows[0].count} jobs in database\n`);
    
    await client.end();
    return true;
  } catch (error) {
    console.log(`❌ Connection failed: ${error.message}\n`);
    return false;
  }
}

test();
