require('dotenv').config();
const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;
let redisPublisher = null;
let redisSubscriber = null;

// ── Circuit Breaker State ──
const cbState = {
  failures: 0,
  isOpen: false,
  openUntil: 0,
  MAX_FAILURES: 5,
  COOLDOWN_MS: 30000,
};

const checkCircuitBreaker = () => {
  if (cbState.isOpen && Date.now() > cbState.openUntil) {
    logger.info('[Redis] Circuit breaker half-open, attempting connection...');
    cbState.isOpen = false;
    cbState.failures = 0;
  }
  return cbState.isOpen;
};

const triggerCircuitBreaker = (role) => {
  cbState.failures++;
  if (cbState.failures >= cbState.MAX_FAILURES && !cbState.isOpen) {
    logger.error(`[Redis] Redis Circuit Breaker Triggered`);
    cbState.isOpen = true;
    cbState.openUntil = Date.now() + cbState.COOLDOWN_MS;
  }
};

const makeOptions = (role) => ({
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  enableOfflineQueue: false, // Prevents memory buildup during outages
  connectTimeout: 5000,
  commandTimeout: 3000,
  lazyConnect: false,
  retryStrategy(times) {
    logger.warn(`[Redis/${role}] Redis Retry Attempt (${times})`);
    
    if (checkCircuitBreaker()) {
      return cbState.COOLDOWN_MS;
    }
    triggerCircuitBreaker(role);
    
    if (times > 30) {
      logger.error(`[Redis/${role}] Max retries exceeded (${times}). Wait 30s.`);
      return 30000;
    }
    // Exponential backoff capped at 3s
    return Math.min(times * 200, 3000); 
  },
  reconnectOnError(err) {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some(e => err.message.includes(e));
  }
});

const bindHandlers = (client, role) => {
  client.on('connect',      () => logger.info(`[Redis/${role}] Redis Connected`));
  client.on('error',        (err) => logger.error(`[Redis/${role}] Error: ${err.message}`));
  client.on('reconnecting', (delay) => logger.warn(`[Redis/${role}] Redis Reconnecting in ${delay}ms`));
  client.on('ready',        () => {
    logger.info(`[Redis/${role}] Redis Ready`);
    cbState.failures = 0;
    cbState.isOpen = false;
  });
  client.on('close',        () => logger.warn(`[Redis/${role}] Redis Connection Closed`));
  client.on('end',          () => logger.warn(`[Redis/${role}] Connection ended. No more retries.`));
};

const initRedis = () => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.warn('[Redis] REDIS_URL not set — running without Pub/Sub (local broadcast fallback active).');
    return;
  }

  try {
    const isLocal = redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1');

    const optsClient = makeOptions('client');
    const optsPub    = makeOptions('publisher');
    const optsSub    = makeOptions('subscriber');

    // Always enable TLS for remote providers (Render/Upstash) regardless of protocol scheme
    if (!isLocal) {
      const tlsConfig = { rejectUnauthorized: false };
      optsClient.tls = tlsConfig;
      optsPub.tls    = tlsConfig;
      optsSub.tls    = tlsConfig;
    }

    redisClient     = new Redis(redisUrl, optsClient);
    redisPublisher  = new Redis(redisUrl, optsPub);
    redisSubscriber = new Redis(redisUrl, optsSub);

    bindHandlers(redisClient,    'client');
    bindHandlers(redisPublisher, 'publisher');
    bindHandlers(redisSubscriber,'subscriber');

    // Startup health check via ping
    redisClient.ping()
      .then(pong => logger.info(`[Redis] Startup health check: ${pong}`))
      .catch(err => logger.warn(`[Redis] Startup health check failed: ${err.message}. Server will continue running.`));

  } catch (err) {
    logger.error(`[Redis] Failed to initialize: ${err.message}`);
  }
};

const closeRedis = async () => {
  logger.info('[Redis] Closing all connections...');
  const tasks = [redisClient, redisPublisher, redisSubscriber]
    .filter(Boolean)
    .map(c => c.quit().catch(() => c.disconnect()));
  await Promise.allSettled(tasks);
  logger.info('[Redis] All connections closed.');
};

// If circuit breaker is open, wrap functionality gracefully or throw immediate error vs queuing
const createSafeProxy = (client) => {
  if (!client) return null;
  return new Proxy(client, {
    get(target, prop) {
      if (typeof target[prop] === 'function') {
        return (...args) => {
          if (cbState.isOpen) {
            // Memory/Session graceful fallback simulation for gets/sets
            if (prop === 'get' || prop === 'hget') return Promise.resolve(null);
            if (prop === 'set' || prop === 'hset' || prop === 'del') return Promise.resolve('OK');
            return Promise.resolve();
          }
          return target[prop].apply(target, args);
        };
      }
      return target[prop];
    }
  });
};

const getPublisher  = () => cbState.isOpen ? createSafeProxy(redisPublisher) : redisPublisher;
const getSubscriber = () => cbState.isOpen ? createSafeProxy(redisSubscriber) : redisSubscriber;
const getClient     = () => cbState.isOpen ? createSafeProxy(redisClient) : redisClient;
const getRawClient  = () => redisClient; // Unproxied for connect-redis

module.exports = {
  initRedis,
  closeRedis,
  getPublisher,
  getSubscriber,
  getClient,
  getRawClient
};
