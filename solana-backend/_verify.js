require('dotenv').config();
try {
  require('./src/auth/passportStrategies');
  require('./src/routes/authRoutes');
  console.log('✅ All auth modules loaded successfully');
} catch(e) {
  console.error('❌ Module load error:', e.message);
  console.error(e.stack);
  process.exit(1);
}
process.exit(0);
