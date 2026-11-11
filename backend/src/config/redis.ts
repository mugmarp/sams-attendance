// backend/src/config/redis.ts
import Redis from 'ioredis';
import { env } from './env';

declare global {
  var redis: Redis | undefined;
}

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  if (!env.REDIS_URL) {
    console.warn('REDIS_URL not set — using in-memory store for check-in codes');
    return null;
  }
  
  if (global.redis) {
    return global.redis;
  }
  
  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) return null; // Stop retrying
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });
  
  redisClient.on('error', (err) => {
    console.error('Redis connection error:', err.message);
  });
  
  redisClient.on('connect', () => {
    console.log('Redis connected');
  });
  
  global.redis = redisClient;
  return redisClient;
}

export function closeRedis(): void {
  if (redisClient) {
    redisClient.quit();
    redisClient = null;
  }
}