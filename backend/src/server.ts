// backend/src/server.ts
import { env } from './config/env';
import app from './app';
import { closeRedis } from './config/redis';

const server = app.listen(env.PORT, () => {
  console.log(`🚀 SAMS Backend running on http://localhost:${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Frontend URL: ${env.FRONTEND_URL}`);
});

function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    try {
      closeRedis();
      console.log('Redis connection closed');
    } catch (err) {
      console.error('Error closing Redis:', err);
    }
    
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  shutdown('UNHANDLED_REJECTION');
});