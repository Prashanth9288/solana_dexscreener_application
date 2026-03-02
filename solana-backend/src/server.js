require("dotenv").config();
const express = require("express");
const cors = require("cors");

const transactionRoutes = require("./routes/transactionRoutes");
const analyticsRoutes   = require("./routes/analyticsRoutes");
const webhookRoutes     = require("./routes/webhookRoutes");
const DBBatcher  = require("./services/dbBatcher");
const pool       = require("./config/db");
const initDb     = require("./config/initDb");
const logger     = require("./utils/logger");

const app = express();

app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/transaction", transactionRoutes);
app.use("/analytics",   analyticsRoutes);
app.use("/webhook",     webhookRoutes);

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function start() {
  // Initialize DB schema before accepting traffic
  await initDb();

  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });

  // ── Graceful Shutdown Handler ───────────────────────────────────────────────
  async function shutdown(signal) {
    logger.warn(`[Server] Received ${signal}. Initiating graceful shutdown...`);

    server.close(async (err) => {
      if (err) logger.error(`[Server] Error closing Express: ${err.message}`);
      else logger.info(`[Server] Express closed. Flushing remaining tasks.`);

      try {
        await DBBatcher.flushAndClose();
      } catch (queueErr) {
        logger.error(`[Server] Failed to flush final batch: ${queueErr.message}`);
      }

      try {
        await pool.end();
        logger.info(`[Server] Database pool closed successfully.`);
      } catch (dbErr) {
        logger.error(`[Server] Failed to close DB pool: ${dbErr.message}`);
      }

      logger.info(`[Server] Process cleanly exited.`);
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
