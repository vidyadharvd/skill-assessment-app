type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type ConsumeRateLimitInput = {
  key: string;
  limit: number;
  scope: string;
  windowMs: number;
};

type RateLimitResult =
  | {
      allowed: true;
      remaining: number;
      resetAt: number;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
      resetAt: number;
    };

const bucket = new Map<string, RateLimitEntry>();

export function consumeRateLimit({
  key,
  limit,
  scope,
  windowMs,
}: ConsumeRateLimitInput): RateLimitResult {
  const now = Date.now();
  const bucketKey = `${scope}:${key}`;
  const current = bucket.get(bucketKey);

  if (!current || current.resetAt <= now) {
    const next = {
      count: 1,
      resetAt: now + windowMs,
    };
    bucket.set(bucketKey, next);
    pruneExpiredEntries(now);
    return {
      allowed: true,
      remaining: Math.max(0, limit - next.count),
      resetAt: next.resetAt,
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((current.resetAt - now) / 1000),
      ),
      resetAt: current.resetAt,
    };
  }

  current.count += 1;
  bucket.set(bucketKey, current);

  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

function pruneExpiredEntries(now: number): void {
  for (const [key, value] of bucket.entries()) {
    if (value.resetAt <= now) {
      bucket.delete(key);
    }
  }
}
