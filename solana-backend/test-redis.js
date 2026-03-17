require('dotenv').config();
const Redis = require('ioredis');
const RedisStore = require('connect-redis').default;

const redisUrl = process.env.REDIS_URL;
const client = new Redis(redisUrl, { tls: { rejectUnauthorized: false } });

client.on('error', (err) => console.error('Redis Client Error', err));

const store = new RedisStore({ client });

async function testStore() {
  console.log('Testing connect-redis with async/await...');
  try {
    await store.set('test-session:1', { cookie: { maxAge: 1000 }, user: 'demo' });
    console.log('SET SUCCESS');
    const data = await store.get('test-session:1');
    console.log('GET SUCCESS:', data);
  } catch (err) {
    console.error('STORE ERROR:', err);
  } finally {
    client.quit();
  }
}

client.once('ready', testStore);
