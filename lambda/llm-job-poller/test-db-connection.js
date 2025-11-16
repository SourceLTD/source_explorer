// Quick test to see which connection string works
const { Client } = require('pg');

const configs = [
  {
    name: 'Pooler Port 5432',
    connectionString: "postgresql://postgres.txyvapnclxnwpiifbxmu:kxzk8RS0q29BNNrN@aws-1-eu-west-2.pooler.supabase.com:5432/postgres"
  },
  {
    name: 'Direct Hostname',
    connectionString: "postgresql://postgres.txyvapnclxnwpiifbxmu:kxzk8RS0q29BNNrN@db.txyvapnclxnwpiifbxmu.supabase.co:5432/postgres"
  }
];

async function testConnection(config) {
  console.log(`\n🔍 Testing: ${config.name}`);
  console.log(`   URL: ${config.connectionString.replace(/:[^:]*@/, ':****@')}`);
  
  const client = new Client({
    connectionString: config.connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    const result = await client.query('SELECT version()');
    console.log(`   ✅ SUCCESS! Connected to PostgreSQL`);
    await client.end();
    return true;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('Testing Supabase connection strings...\n');
  
  for (const config of configs) {
    const success = await testConnection(config);
    if (success) {
      console.log(`\n✅ USE THIS CONNECTION STRING:\n   DATABASE_URL="${config.connectionString}"\n`);
      break;
    }
  }
}

main();
