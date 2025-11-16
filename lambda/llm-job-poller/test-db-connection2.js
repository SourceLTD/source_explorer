const { Client } = require('pg');

const configs = [
  {
    name: 'Pooler Port 6543 (Transaction Mode)',
    connectionString: "postgresql://postgres.txyvapnclxnwpiifbxmu:kxzk8RS0q29BNNrN@aws-1-eu-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
  },
  {
    name: 'Pooler Port 6543 with sslmode',
    connectionString: "postgresql://postgres.txyvapnclxnwpiifbxmu:kxzk8RS0q29BNNrN@aws-1-eu-west-2.pooler.supabase.com:6543/postgres?sslmode=require"
  },
  {
    name: 'Direct with IPv4',
    connectionString: "postgresql://postgres.txyvapnclxnwpiifbxmu:kxzk8RS0q29BNNrN@db.txyvapnclxnwpiifbxmu.supabase.co:5432/postgres",
    family: 4
  }
];

async function testConnection(config) {
  console.log(`\n🔍 Testing: ${config.name}`);
  console.log(`   URL: ${config.connectionString.replace(/:[^:]*@/, ':****@')}`);
  
  const client = new Client({
    connectionString: config.connectionString,
    ssl: { rejectUnauthorized: false },
    ...(config.family && { host: new URL(config.connectionString).hostname })
  });
  
  try {
    await client.connect();
    const result = await client.query('SELECT 1 as test');
    console.log(`   ✅ SUCCESS!`);
    await client.end();
    return config.connectionString;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('Testing more Supabase connection variations...\n');
  
  for (const config of configs) {
    const success = await testConnection(config);
    if (success) {
      console.log(`\n✅ WORKING CONNECTION FOUND!\n`);
      console.log(`Update your .env file:`);
      console.log(`DATABASE_URL="${success}"\n`);
      return;
    }
  }
  
  console.log(`\n❌ None of the standard connection strings worked.`);
  console.log(`\nPlease check your Supabase dashboard for the correct connection string:`);
  console.log(`  1. Go to Project Settings > Database`);
  console.log(`  2. Look for "Connection string"`);
  console.log(`  3. Copy the "Session mode" or "Direct connection" string`);
}

main();
