import redis from '../config/redis.js';

const TTL = parseInt(process.env.REDIS_TTL ?? '3600', 10);

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setCache(key: string, value: unknown): Promise<void> {
  try {
    await redis.setex(key, TTL, JSON.stringify(value));
  } catch {
    // cache failures are non-fatal
  }
}

export async function delCache(...keys: string[]): Promise<void> {
  try {
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // cache failures are non-fatal
  }
}

export const KEYS = {
  category: (id: string) => `category:${id}`,
  byName: (name: string) => `category:name:${name}`,
  all: 'categories:all',
};
