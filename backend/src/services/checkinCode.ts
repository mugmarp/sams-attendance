// backend/src/services/checkinCode.ts
import { getRedis } from '../config/redis';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O,0,I,1
const CODE_LENGTH = 6;
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ROTATION_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

interface CheckinCodeData {
  code: string;
  sessionId: string;
  expiresAt: number; // timestamp
  rotatedAt: number;
}

// In-memory fallback when Redis not available
const memoryStore = new Map<string, CheckinCodeData>();

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function getStore() {
  const redis = getRedis();
  return {
    async get(key: string): Promise<CheckinCodeData | null> {
      if (redis) {
        const data = await redis.get(`checkin:${key}`);
        return data ? JSON.parse(data) : null;
      }
      return memoryStore.get(key) ?? null;
    },
    async set(key: string, data: CheckinCodeData, ttlMs: number): Promise<void> {
      if (redis) {
        await redis.setex(`checkin:${key}`, Math.ceil(ttlMs / 1000), JSON.stringify(data));
      } else {
        memoryStore.set(key, data);
        // Auto-cleanup
        setTimeout(() => memoryStore.delete(key), ttlMs);
      }
    },
    async del(key: string): Promise<void> {
      if (redis) {
        await redis.del(`checkin:${key}`);
      } else {
        memoryStore.delete(key);
      }
    },
  };
}

export async function startCheckin(sessionId: string): Promise<{ code: string; expiresAt: Date }> {
  const store = getStore();
  
  // Check if already has active code
  const existing = await store.get(sessionId);
  if (existing && Date.now() < existing.expiresAt) {
    throw new Error('Session already has an active check-in code');
  }
  
  const code = generateCode();
  const now = Date.now();
  const expiresAt = now + CODE_TTL_MS;
  
  const data: CheckinCodeData = {
    code,
    sessionId,
    expiresAt,
    rotatedAt: now,
  };
  
  await store.set(sessionId, data, CODE_TTL_MS);
  
  // Schedule rotation
  scheduleRotation(sessionId);
  
  return { code, expiresAt: new Date(expiresAt) };
}

export async function rotateCode(sessionId: string): Promise<void> {
  const store = getStore();
  const existing = await store.get(sessionId);
  
  if (!existing || Date.now() >= existing.expiresAt) {
    return; // Expired or doesn't exist
  }
  
  const code = generateCode();
  const now = Date.now();
  
  const data: CheckinCodeData = {
    ...existing,
    code,
    rotatedAt: now,
  };
  
  await store.set(sessionId, data, existing.expiresAt - now);
  
  // Schedule next rotation
  scheduleRotation(sessionId);
}

function rotationTimers = new Map<string, NodeJS.Timeout>();

function scheduleRotation(sessionId: string): void {
  // Clear existing timer
  const existingTimer = rotationTimers.get(sessionId);
  if (existingTimer) {
    clearInterval(existingTimer);
  }
  
  const timer = setInterval(() => {
    rotateCode(sessionId).catch(err => {
      console.error(`Rotation failed for ${sessionId}:`, err);
    });
  }, ROTATION_INTERVAL_MS);
  
  rotationTimers.set(sessionId, timer);
  
  // Clean up timer when code expires
  setTimeout(() => {
    const t = rotationTimers.get(sessionId);
    if (t) {
      clearInterval(t);
      rotationTimers.delete(sessionId);
    }
  }, CODE_TTL_MS);
}

export async function validateCode(sessionId: string, submittedCode: string): Promise<boolean> {
  const store = getStore();
  const data = await store.get(sessionId);
  
  if (!data) return false;
  if (Date.now() >= data.expiresAt) return false;
  
  return data.code === submittedCode.toUpperCase();
}

export async function stopCheckin(sessionId: string): Promise<void> {
  const store = getStore();
  await store.del(sessionId);
  
  const timer = rotationTimers.get(sessionId);
  if (timer) {
    clearInterval(timer);
    rotationTimers.delete(sessionId);
  }
}

export async function getActiveCode(sessionId: string): Promise<{ code: string; expiresAt: Date } | null> {
  const store = getStore();
  const data = await store.get(sessionId);
  
  if (!data || Date.now() >= data.expiresAt) return null;
  
  return { code: data.code, expiresAt: new Date(data.expiresAt) };
}