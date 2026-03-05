require("dotenv").config();
const express = require("express");
const cors    = require("cors");

const transactionRoutes = require("./routes/transactionRoutes");
const analyticsRoutes   = require("./routes/analyticsRoutes");
const webhookRoutes     = require("./routes/webhookRoutes");
const DBBatcher         = require("./services/dbBatcher");
const wsBroadcaster     = require("./services/wsService");
const pool              = require("./config/db");
const initDb            = require("./config/initDb");
const logger            = require("./utils/logger");

const app = express();

// ── CORS — allow all origins (frontend on Render / Vite dev) ─────────────────
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(express.json({ limit: '10mb' }));

// ── HTTP Routes ───────────────────────────────────────────────────────────────
app.use("/transaction", transactionRoutes);
app.use("/analytics",   analyticsRoutes);
app.use("/webhook",     webhookRoutes);

app.get("/health", async (req, res) => {
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
    uptime:     process.uptime(),
    timestamp:  new Date().toISOString(),
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await initDb();
    logger.info("Database schema initialized.");
  } catch (dbErr) {
    logger.warn(`DB init failed (will retry on next query): ${dbErr.message}`);
  }

  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
  });

  // ── WebSocket Server on /ws ───────────────────────────────────────────────
  // Attach AFTER app.listen() so httpServer exists.
  // Frontend connects to: wss://solana-dexscreener-application-3.onrender.com/ws
  wsBroadcaster.attach(server);
  logger.info("📡 WebSocket server attached on /ws");

  // ── Graceful Shutdown ─────────────────────────────────────────────────────
  async function shutdown(signal) {
    logger.warn(`[Server] ${signal} received — shutting down...`);
    server.close(async () => {
      try { await DBBatcher.flushAndClose(); } catch { /* ignore */ }
      try { await pool.end(); } catch { /* ignore */ }
      process.exit(0);
    });
  }

  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
