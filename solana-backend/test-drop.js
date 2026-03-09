const pool = require('./src/config/db');

async function dropAndCheck() {
  const client = await pool.connect();
  console.log("Dropping candles_1m table to force recreation...");
  await client.query("DROP TABLE IF EXISTS candles_1m CASCADE;");
  console.log("Dropped candles_1m.");
  
  console.log("Dropping pairs table to force recreation...");
  await client.query("DROP TABLE IF EXISTS pairs CASCADE;");
  console.log("Dropped pairs.");
  
  console.log("Dropping tokens table to force recreation...");
  await client.query("DROP TABLE IF EXISTS tokens CASCADE;");
  console.log("Dropped tokens.");
  
  client.release();
  process.exit(0);
}

dropAndCheck().catch(console.error);
