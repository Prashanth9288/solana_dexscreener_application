const session = require('express-session');
const { RedisStore } = require('connect-redis');
const Redis = require('ioredis');

async function run() {
  try {
    const rawClient = new Redis("redis://localhost:6379");
    await rawClient.ping();
    console.log("Ping ok");

    const store = new RedisStore({ client: rawClient, prefix: 'sess:' });
    
    // Simulate express-session set
    await store.set('test-session', { cookie: { maxAge: 300000 }, user: 'test' });
    console.log("Store SET ok");

    const get = await store.get('test-session');
    console.log("Store GET ok:", get);

    process.exit(0);
  } catch(err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

run();
