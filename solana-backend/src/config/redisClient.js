const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;
let redisPublisher = null;
let redisSubscriber = null;

// Common hardened options for all three connection instances
const makeOptions = (role) => ({
  maxRetriesPerRequest: null,
  enableReadyCheck: true,             // Wait for READY before accepting commands
  enableOfflineQueue: false,          // VERY IMPORTANT: Do NOT buffer commands in memory if Redis is dead
  connectTimeout: 5000,               // 5s connection timeout
  commandTimeout: 3000,               // 3s per command before timeout
  lazyConnect: false,
  retryStrategy(times) {
    if (times > 30) {
      logger.error(`[Redis/${role}] Max retries exceeded (${times}). Will try again in 30s.`);
      return 30000;
    }
    const delay = Math.min(times * 100, 3000);
    logger.warn(`[Redis/${role}] Retry #${times} in ${delay}ms`);
    return delay;
  },
  reconnectOnError(err) {
    // Auto-reconnect on READONLY errors (Redis failover scenarios)
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some(e => err.message.includes(e));
  }
});

const bindHandlers = (client, role) => {
  client.on('error',        (err) => logger.error(`[Redis/${role}] Error: ${err.message}`));
  client.on('reconnecting', (delay) => logger.warn(`[Redis/${role}] Reconnecting in ${delay}ms`));
  client.on('ready',        () => logger.info(`[Redis/${role}] Ready ✓`));
  client.on('close',        () => logger.warn(`[Redis/${role}] Connection closed`));
  client.on('end',          () => logger.warn(`[Redis/${role}] Connection ended. No more retries.`));
};

const initRedis = () => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.warn('[Redis] REDIS_URL not set — running without Pub/Sub (local broadcast fallback active).');
    return;
  }

  try {
    redisClient    = new Redis(redisUrl, makeOptions('client'));
    redisPublisher = new Redis(redisUrl, makeOptions('publisher'));
    redisSubscriber = new Redis(redisUrl, makeOptions('subscriber'));

    bindHandlers(redisClient,    'client');
    bindHandlers(redisPublisher, 'publisher');
    bindHandlers(redisSubscriber,'subscriber');

  } catch (err) {
    logger.error(`[Redis] Failed to initialize: ${err.message}`);
  }
};

/** Gracefully disconnects all 3 Redis instances on shutdown */
const closeRedis = async () => {
  logger.info('[Redis] Closing all connections...');
  const tasks = [redisClient, redisPublisher, redisSubscriber]
    .filter(Boolean)
    .map(c => c.quit().catch(() => c.disconnect()));
  await Promise.allSettled(tasks);
  logger.info('[Redis] All connections closed.');
};

const getPublisher  = () => redisPublisher;
const getSubscriber = () => redisSubscriber;
const getClient     = () => redisClient;

module.exports = {
  initRedis,
  closeRedis,
  getPublisher,
  getSubscriber,
  getClient
};
