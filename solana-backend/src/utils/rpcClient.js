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
const CIRCUIT_BREAKER_THRESHOLD = 50;
let circuitBreakerOpenUntil = 0;

// Exponential Backoff RPC Fetcher
async function fetchWithRetry(payload, maxRetries = 3) {
  if (Date.now() < circuitBreakerOpenUntil) {
    throw new Error("RPC Circuit Breaker isOpen");
  }

  let attempt = 0;
  let delay = 300; // ms

  while (attempt < maxRetries) {
    try {
      const response = await rpcClient.post('', payload);
      circuitBreakerFailures = 0;
      return response.data;
    } catch (err) {
      circuitBreakerFailures++;
      if (circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        circuitBreakerOpenUntil = Date.now() + 10000;
        const msg = "RPC Circuit Breaker Tripped!";
        logger.error(msg);
        throw new Error(msg);
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
