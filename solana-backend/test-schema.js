const pool = require('./src/config/db');

async function checkSchema() {
  const client = await pool.connect();
  const res = await client.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;");
  console.log(JSON.stringify(res.rows, null, 2));
  client.release();
  process.exit(0);
}

checkSchema().catch(console.error);
