const axios = require('axios');
const http = require('http');
const https = require('https');
const logger = require('./logger');
const RPC_ENDPOINTS = require('../config/rpc');

// High-throughput socket configurations
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 1000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 1000 });

const rpcClient = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 5000,
});

let currentEndpointIndex = 0;
let circuitBreakerFailures = 0;
const CIRCUIT_BREAKER_THRESHOLD = 5; // Rotation threshold
let circuitBreakerOpenUntil = 0;

// Exponential Backoff RPC Fetcher with Endpoint Rotation
async function fetchWithRetry(payload, maxRetries = 3) {
  let attempt = 0;
  let delay = 300; // ms

  while (attempt < maxRetries) {
    if (Date.now() < circuitBreakerOpenUntil && RPC_ENDPOINTS.length > 1) {
      // Rotating endpoint immediately if breaker is open
      currentEndpointIndex = (currentEndpointIndex + 1) % RPC_ENDPOINTS.length;
      circuitBreakerOpenUntil = 0; 
      circuitBreakerFailures = 0;
      logger.info(`[RPC] Circuit Breaker rotating to endpoint ${currentEndpointIndex}`);
    }

    const endpoint = RPC_ENDPOINTS[currentEndpointIndex];

    try {
      const response = await rpcClient.post(endpoint, payload);
      circuitBreakerFailures = 0;
      return response.data;
    } catch (err) {
      circuitBreakerFailures++;
      if (circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        circuitBreakerOpenUntil = Date.now() + 10_000;
        logger.error(`[RPC] Endpoint ${endpoint} tripped! Circuit breaker open for 10s.`);
      }

      attempt++;
      if (attempt >= maxRetries) {
        logger.error(`[RPC] Fetch Exhausted. Retries: ${attempt}. Error: ${err.message}`);
        throw err;
      }
      
      const status = err.response ? err.response.status : 500;
      if (status >= 400 && status < 500 && status !== 429) {
        // No retry for 400 series except 429 Rate Limits
        throw err;
      }
      
      const isRateLimited = status === 429;
      const waitTime = isRateLimited ? delay * 2 : delay;

      if (isRateLimited && RPC_ENDPOINTS.length > 1) {
         logger.warn(`[RPC] Rate limit 429 hit on ${endpoint}, auto-rotating...`);
         currentEndpointIndex = (currentEndpointIndex + 1) % RPC_ENDPOINTS.length;
         circuitBreakerFailures = 0;
      }
      
      logger.warn(`[RPC] Failure on ${endpoint} (${err.message}), retrying in ${waitTime}ms... (Attempt ${attempt}/${maxRetries})`);
      await new Promise(res => setTimeout(res, waitTime));
      delay *= 2; // Exponential backoff
    }
  }
}

module.exports = {
  fetchWithRetry,
  rpcClient
};
