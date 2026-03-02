function log(level, message, data = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data
  };
  
  // Use process.stdout.write to prevent the minor blocking overhead
  // of JSON.stringify + console.log formatting in high-throughput loops.
  try {
    process.stdout.write(JSON.stringify(payload) + '\n');
  } catch(e) {
    // fallback
    console.log(JSON.stringify(payload));
  }
}

const logger = {
  info: (msg, data) => log('INFO', msg, data),
  warn: (msg, data) => log('WARN', msg, data),
  error: (msg, data) => log('ERROR', msg, data),
  debug: (msg, data) => {
    // Enable debug logs via environment variable if necessary
    if (process.env.DEBUG === 'true') {
      log('DEBUG', msg, data);
    }
  }
};

module.exports = logger;
