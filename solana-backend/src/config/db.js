// src/config/db.js
// 1000+ TPS Production PostgreSQL Connection Pool 

const { Pool } = require('pg');
const logger = require('../utils/logger');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// In production, Render provides DATABASE_URL
const dbConfig = isProduction
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Required for Render Postgres
    }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'solana_dex',
      password: process.env.DB_PASSWORD || 'password',
      port: process.env.DB_PORT || 5432,
    };

// High-Throughput Pool Settings
const poolConfig = {
  ...dbConfig,
  max: 50, // Increase max connections from 10 to 50 for burst loads
  idleTimeoutMillis: 30000, 
  connectionTimeoutMillis: 10000, // 10s timeout (increased for cold starts)
  maxUses: 7500, // Recycle connections to prevent memory leaks
};

const pool = new Pool(poolConfig);

// Handle unexpected pool errors silently so the server doesn't crash under load
pool.on('error', (err, client) => {
  logger.error('Unexpected error on idle client', err);
});

// Verify connectivity at startup (non-blocking - don't crash if DB is down)
pool.connect().then(client => {
  logger.info('Successfully connected to the PostgreSQL database.');
  client.release();
}).catch(err => {
  logger.warn(`DB not reachable at startup: ${err.message}. Server will start anyway.`);
});

module.exports = pool;