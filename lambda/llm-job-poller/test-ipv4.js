const { Client } = require('pg');
const dns = require('dns');

async function test() {
  const host = 'db.txyvapnclxnwpiifbxmu.supabase.co';
  const password = 'kxzk8RS0q29BNNrN';
  
  console.log('🔍 Resolving hostname...\n');
  
  // Force IPv4 resolution
  dns.setDefaultResultOrder('ipv4first');
  
  const client = new Client({
    host: host,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: password,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    console.log('Attempting connection with IPv4 preference...');
    await client.connect();
    console.log('✅ Connection successful!\n');
    
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
