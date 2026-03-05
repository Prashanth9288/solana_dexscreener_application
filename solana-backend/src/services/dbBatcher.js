const pool = require('../config/db');
const logger = require('../utils/logger');
const wsBroadcaster = require('./wsService');
const { getPublisher } = require('../config/redisClient');

let decodeQueue = [];
let isProcessing = false;
const BATCH_SIZE = parseInt(process.env.DB_BATCH_SIZE) || 2000;
const MAX_QUEUE_LIMIT = parseInt(process.env.MAX_QUEUE_LIMIT) || 100000;

class DBBatcher {
  static pushToQueue(txData) {
    decodeQueue.push(txData);
    
    // Overflow handling
    if (decodeQueue.length > MAX_QUEUE_LIMIT) {
      logger.warn("Queue overflow — dropping oldest 5000 items");
      decodeQueue.splice(0, 5000);
    }
    
    // Optionally trigger immediate flush if batch size is reached to clear memory
    if (decodeQueue.length >= 10000 && !isProcessing) {
      this.processBatch();
    }
  }

  static getQueueSize() {
    return decodeQueue.length;
  }

  static async processBatch() {
    if (decodeQueue.length === 0 || isProcessing) return;

    isProcessing = true;
    
    // Slice off items safely
    const batch = decodeQueue.splice(0, BATCH_SIZE);
    
    if (batch.length === 0) {
      isProcessing = false;
      return;
    }

    let retries = 0;
    while (retries < 3) {
      try {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Postgres has maximum ~65535 parameter limit per query.
          // 22 parameters per row means max 2900 rows per chunk safely.
          const CHUNK_SIZE = 2500;
          for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
            const chunk = batch.slice(i, i + CHUNK_SIZE);

            const values = [];
            const flatParams = [];
            let paramIdx = 1;

            for (const row of chunk) {
              values.push(`($${paramIdx++}, $${paramIdx++}, to_timestamp($${paramIdx++}), $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, 'swap', $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW(), $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
              
              flatParams.push(
                row.signature, row.slot, row.block_time, row.wallet, row.dex,
                row.program_id, row.swap_side, row.base_token, row.base_token_decimals, row.base_amount,
                row.quote_token, row.quote_token_decimals, row.quote_amount,
                row.price_usd, row.price_native, row.usd_value, row.fee_lamports,
                row.hop_type, row.hop_count, row.final_hop
              );
            }

            const query = `
              INSERT INTO swaps (
                signature, slot, block_time, wallet,
                dex, program_id, type, swap_side,
                base_token, base_token_decimals, base_amount,
                quote_token, quote_token_decimals, quote_amount,
                price_usd, price_native, usd_value,
                fee_lamports, created_at,
                hop_type, hop_count, final_hop
              )
              VALUES ${values.join(',')}
              ON CONFLICT (signature) DO NOTHING
            `;

            await client.query(query, flatParams);

            // ── BROADCAST (REDIS PUB/SUB OR LOCAL FALLBACK) ──
            // getPublisher() is resolved once at module load — no hot-require
            const publisher = getPublisher();

            if (publisher && publisher.status === 'ready') {
              const grouped = {};
              for (const row of chunk) {
                // Build microscopic, frontend-ready payload only for valid mints
                const baseOk  = row.base_token  && row.base_token  !== 'undefined' && row.base_token  !== 'null';
                const quoteOk = row.quote_token && row.quote_token !== 'undefined' && row.quote_token !== 'null';
                if (!baseOk && !quoteOk) continue;

                const miniTrade = {
                  signature:   row.signature,
                  price_usd:   row.price_usd,
                  usd_value:   row.usd_value,
                  base_token:  row.base_token,
                  quote_token: row.quote_token,
                  base_amount: row.base_amount,
                  swap_side:   row.swap_side,
                  block_time:  row.block_time,
                  dex:         row.dex,
                  wallet:      row.wallet
                };

                const addToGroup = (chan) => {
                  if (!grouped[chan]) grouped[chan] = [];
                  grouped[chan].push(miniTrade);
                };
                if (baseOk)  addToGroup(`trades:${row.base_token}`);
                if (quoteOk) addToGroup(`trades:${row.quote_token}`);
              }

              // Batch publish: one Redis call per unique channel, not per trade
              const publishPromises = Object.entries(grouped).map(([channel, trades]) =>
                publisher.publish(channel, JSON.stringify({ type: 'trades', data: trades }))
                  .catch(err => logger.warn(`[Redis] Publish failed [${channel}]: ${err.message}`))
              );
              // Non-blocking: don't stall DB transaction on Redis latency
              Promise.allSettled(publishPromises);

            } else if (wsBroadcaster.clientCount() > 0) {
              // Fallback: monolithic WS broadcast when Redis is offline
              wsBroadcaster.broadcast({ type: 'trades', data: chunk });
            }
          }
          await client.query("COMMIT");
          logger.info(`Successfully batched ${batch.length} rows into database.`);
          break; // break retry loop on success
        } catch (e) {
          await client.query("ROLLBACK");
          throw e; // goes to retry mechanism wrapper below
        } finally {
          client.release();
        }
      } catch (err) {
        retries++;
        if (retries >= 3) {
          logger.error(`Database batch insert fully exhausted.`, { error: err.message, batchSize: batch.length });
        } else {
          logger.warn(`DB Insertion failed (attempt ${retries}), retrying...`, { error: err.message });
          // Exponential backoff
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retries)));
        }
      }
    }

    isProcessing = false;
      
    // Recursive call if queue still has items
    if (decodeQueue.length > 0) {
      setImmediate(() => this.processBatch());
    }
  }

  // Graceful shutdown hook
  static async flushAndClose() {
    logger.info(`Received shutdown signal. Flushing ${decodeQueue.length} remaining items from queue.`);
    while (decodeQueue.length > 0) {
      await this.processBatch();
    }
    logger.info(`Queue flushed.`);
  }
}

// Start Background Loop every 500ms
setInterval(() => {
  DBBatcher.processBatch();
}, 500);

process.on('SIGTERM', async () => {
  await DBBatcher.flushAndClose();
});

module.exports = DBBatcher;
