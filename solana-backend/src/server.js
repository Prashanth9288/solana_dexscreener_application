require("dotenv").config();
const express = require("express");
const cors    = require("cors");

const transactionRoutes = require("./routes/transactionRoutes");
const analyticsRoutes   = require("./routes/analyticsRoutes");
const webhookRoutes     = require("./routes/webhookRoutes");
const DBBatcher         = require("./services/dbBatcher");
const wsBroadcaster     = require("./services/wsService");
const candleEngine      = require("./services/candleEngine");
const pairAggregator    = require("./services/pairAggregator");
const pool              = require("./config/db");
const initDb            = require("./config/initDb");
const { initRedis, closeRedis } = require("./config/redisClient");
const logger            = require("./utils/logger");

const app = express();

// ── CORS — allow all origins (frontend on Render / Vite dev) ─────────────────
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(express.json({ limit: '10mb' }));

// ── HTTP Routes ───────────────────────────────────────────────────────────────
app.use("/api/transaction", transactionRoutes);
app.use("/api/analytics",   analyticsRoutes);
app.use("/api/webhook",     webhookRoutes);

app.get("/api/health", async (req, res) => {
  let dbStatus = 'unknown';
  try {
    await pool.query('SELECT 1');
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }
  res.json({
    status:     "OK",
    db:         dbStatus,
    ws_clients: wsBroadcaster.clientCount(),
    candles:    candleEngine.getStats(),
    uptime:     process.uptime(),
    timestamp:  new Date().toISOString(),
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await initDb();
    initRedis();
    logger.info("Database and Redis initialized.");
  } catch (dbErr) {
    logger.warn(`DB init failed (will retry on next query): ${dbErr.message}`);
  }

  // ── Start background services ──────────────────────────────────────────────
  candleEngine.start();
  pairAggregator.start();
  logger.info("🔥 CandleEngine and PairAggregator started.");

  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
  });

  // ── WebSocket Server on /ws ───────────────────────────────────────────────
  wsBroadcaster.attach(server);
  logger.info("📡 WebSocket server attached on /ws");

  // ── Graceful Shutdown ─────────────────────────────────────────────────────
  async function shutdown(signal) {
    logger.warn(`[Server] ${signal} received — initiating graceful shutdown...`);

    const hardKill = setTimeout(() => {
      logger.error('[Server] Shutdown timed out after 10s — forcing exit');
      process.exit(1);
    }, 10_000);
    if (hardKill.unref) hardKill.unref();

    server.close(async () => {
      try { wsBroadcaster.close();            } catch { /* ignore */ }
      try { await candleEngine.stop();        } catch { /* ignore */ }
      try { pairAggregator.stop();            } catch { /* ignore */ }
      try { await DBBatcher.flushAndClose();  } catch { /* ignore */ }
      try { await closeRedis();               } catch { /* ignore */ }
      try { await pool.end();                 } catch { /* ignore */ }
      clearTimeout(hardKill);
      logger.info('[Server] Shutdown complete. Goodbye.');
      process.exit(0);
    });
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
