require("dotenv").config();
const express = require("express");
const cors = require("cors");

const transactionRoutes = require("./routes/transactionRoutes");
const DBBatcher = require("./services/dbBatcher");
const pool = require("./config/db");
const logger = require("./utils/logger");
const app = express();

app.use(cors());
app.use(express.json());

app.use("/transaction", transactionRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// --- Graceful Shutdown Handler ---
async function shutdown(signal) {
  logger.warn(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);
  
  // Refuse new requests
  server.close(async (err) => {
    if (err) logger.error(`[Server] Error closing Express: ${err.message}`);
    else logger.info(`[Server] Express closed. Unloading remaining tasks.`);
    
    // Flush the high-throughput Batcher queue deterministically
    try {
      await DBBatcher.flushAndClose();
    } catch(queueErr) {
      logger.error(`[Server] Failed to flush final batch: ${queueErr.message}`);
    }

    // Terminate DB Connection gracefully
    try {
      await pool.end();
      logger.info(`[Server] Database pool closed successfully.`);
    } catch(dbErr) {
      logger.error(`[Server] Failed to close DB pool: ${dbErr.message}`);
    }

    logger.info(`[Server] Process cleanly exited.`);
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));