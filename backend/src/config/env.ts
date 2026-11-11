// backend/src/config/env.ts
import dotenv from 'dotenv';
dotenv.config();

interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  FRONTEND_URL: string;
  
  DATABASE_URL: string;
  
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL: string;
  
  REDIS_URL?: string;
  
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
}

const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env: EnvConfig = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '3000', 10),
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  
  DATABASE_URL: process.env.DATABASE_URL!,
  
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? '15m',
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL ?? '7d',
  
  REDIS_URL: process.env.REDIS_URL,
  
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '100', 10),
};

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';