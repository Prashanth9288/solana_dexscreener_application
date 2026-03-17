require("dotenv").config();
const express = require("express");
const cors    = require("cors");

const transactionRoutes = require("./routes/transactionRoutes");
const analyticsRoutes   = require("./routes/analyticsRoutes");
const webhookRoutes     = require("./routes/webhookRoutes");
const authRoutes        = require("./routes/authRoutes");
const watchlistRoutes   = require("./routes/watchlistRoutes");
const DBBatcher         = require("./services/dbBatcher");
const wsBroadcaster     = require("./services/wsService");
const candleEngine      = require("./services/candleEngine");
const pairAggregator    = require("./services/pairAggregator");
const pool              = require("./config/db");
const initDb            = require("./config/initDb");
const { initRedis, closeRedis, getClient, getRawClient } = require("./config/redisClient");
const logger            = require("./utils/logger");
const helmet            = require("helmet");
const session           = require("express-session");
const passport          = require("./auth/passportStrategies");
const { RedisStore }    = require("connect-redis");

const app = express();
app.set("trust proxy", 1);

// ── CORS Config ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:3000",
    process.env.FRONTEND_URL,
  ],
  credentials: true,
}));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10mb' }));

initRedis();

// Use a strictly clean, isolated Redis client specifically for express-session.
// Shared clients wrapped in Proxies or configured with strict queueing (enableOfflineQueue: false)
// cause connect-redis pipelines to crash with ERR syntax errors on connection edges.
const Redis = require('ioredis');
const sessionStoreClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Crucial: parse cookies BEFORE session can decode the session ID from them
const cookieParser = require('cookie-parser');
const sessionSecret = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'dev-session-secret';
app.use(cookieParser(sessionSecret));

const sessionConfig = {
  store: new RedisStore({
    client: sessionStoreClient,
    prefix: "sess:",
  }),
  name: "sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 1000 * 60 * 60,
  },
};

app.use(session(sessionConfig));

app.use(passport.initialize());
app.use(passport.session());

// ── HTTP Routes ───────────────────────────────────────────────────────────────
app.use("/api/transaction", transactionRoutes);
app.use("/api/analytics",   analyticsRoutes);
app.use("/api/webhook",     webhookRoutes);
app.use("/api/auth",        authRoutes);
app.use("/api/watchlist",   watchlistRoutes);

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
    // Redis already initialized above (before session middleware)
    logger.info("Database initialized. Redis was initialized at module load.");
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
