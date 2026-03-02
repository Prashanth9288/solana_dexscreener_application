const axios = require('axios');
const http = require('http');
const https = require('https');
const logger = require('./logger');
const RPC_URL = require('../config/rpc');

// High-throughput socket configurations
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 1000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 1000 });

const rpcClient = axios.create({
  baseURL: RPC_URL, // Optional depending on how it's used
  httpAgent,
  httpsAgent,
  timeout: 3000,
});

let circuitBreakerFailures = 0;
// Threshold: 20 consecutive failures trips the breaker (not 50).
// With a concurrency-limited webhook queue (3 workers), this avoids
// false trips from burst load while still protecting against real outages.
const CIRCUIT_BREAKER_THRESHOLD = 20;
let circuitBreakerOpenUntil = 0;
let circuitBreakerTripped = false;

// Exponential Backoff RPC Fetcher
async function fetchWithRetry(payload, maxRetries = 3) {
  // OPEN state: block until cooldown expires (half-open probe allowed after)
  if (Date.now() < circuitBreakerOpenUntil) {
    throw new Error("RPC Circuit Breaker isOpen");
  }
  // HALF-OPEN: cooldown expired, let one request through to probe recovery
  if (circuitBreakerTripped) {
    logger.info("RPC Circuit Breaker: probing recovery...");
  }

  let attempt = 0;
  let delay = 300; // ms

  while (attempt < maxRetries) {
    try {
      const response = await rpcClient.post('', payload);
      // CLOSED: success — fully reset failure counter
      if (circuitBreakerTripped) {
        logger.info('RPC Circuit Breaker: recovered — resetting.');
      }
      circuitBreakerFailures = 0;
      circuitBreakerTripped  = false;
      return response.data;
    } catch (err) {
      circuitBreakerFailures++;
      if (circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        // OPEN: 30s cooldown before half-open probe
        circuitBreakerOpenUntil = Date.now() + 30_000;
        circuitBreakerTripped   = true;
        const msg = `RPC Circuit Breaker Tripped! (${circuitBreakerFailures} failures). Cooling down 30s.`;
        logger.error(msg);
        throw new Error('RPC Circuit Breaker isOpen');
      }

      attempt++;
      if (attempt >= maxRetries) {
        logger.error(`RPC Fetch Exhausted. Retries: ${attempt}. Error: ${err.message}`);
        throw err;
      }
      
      const status = err.response ? err.response.status : 500;
      if (status >= 400 && status < 500 && status !== 429) {
        // No retry for 400 series except 429 Rate Limits
        throw err;
      }
      
      const isRateLimited = status === 429;
      const waitTime = isRateLimited ? delay * 2 : delay;
      
      logger.warn(`RPC Failure (${err.message}), retrying in ${waitTime}ms... (Attempt ${attempt}/${maxRetries})`);
      await new Promise(res => setTimeout(res, waitTime));
      delay *= 2; // Exponential backoff
    }
  }
}

module.exports = {
  fetchWithRetry,
  rpcClient
};
