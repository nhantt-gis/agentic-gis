/**
 * In-memory LRU cache with TTL for API route responses.
 * Includes inflight request deduplication to avoid duplicate LLM calls.
 */

import { createHash } from 'node:crypto';
import type OpenAI from 'openai';
import type { AgentRoutePayload } from '@/types';

// ── Configuration ────────────────────────────────────────────────────

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const CACHE_ENABLED = process.env.MAP_AGENT_CACHE_ENABLED !== 'false';
const CACHE_TTL_MS = parseNumberEnv(process.env.MAP_AGENT_CACHE_TTL_MS, 5 * 60 * 1000);
const CACHE_MAX_ENTRIES = parseNumberEnv(process.env.MAP_AGENT_CACHE_MAX_ENTRIES, 200);

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

// ── Types ────────────────────────────────────────────────────────────

interface CacheEntry {
  value: AgentRoutePayload;
  createdAt: number;
  expiresAt: number;
}

// ── Storage ──────────────────────────────────────────────────────────

const RESPONSE_CACHE = new Map<string, CacheEntry>();
const INFLIGHT_REQUESTS = new Map<string, Promise<AgentRoutePayload>>();

// ── Cache Key ────────────────────────────────────────────────────────

export function buildCacheKey(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): string {
  const payload = JSON.stringify({ model: OPENROUTER_MODEL, messages });
  return createHash('sha256').update(payload).digest('hex');
}

// ── Pruning ──────────────────────────────────────────────────────────

function pruneCache(now: number): void {
  const expiredKeys: string[] = [];
  RESPONSE_CACHE.forEach((entry, key) => {
    if (entry.expiresAt <= now) expiredKeys.push(key);
  });
  expiredKeys.forEach((key) => RESPONSE_CACHE.delete(key));

  if (RESPONSE_CACHE.size <= CACHE_MAX_ENTRIES) return;

  const entriesByAge = Array.from(RESPONSE_CACHE.entries()).sort(
    (a, b) => a[1].createdAt - b[1].createdAt,
  );
  const removeCount = RESPONSE_CACHE.size - CACHE_MAX_ENTRIES;
  for (let i = 0; i < removeCount; i += 1) {
    const key = entriesByAge[i]?.[0];
    if (key) RESPONSE_CACHE.delete(key);
  }
}

// ── Public API ───────────────────────────────────────────────────────

export function getCachedResponse(cacheKey: string): AgentRoutePayload | null {
  if (!CACHE_ENABLED || CACHE_TTL_MS <= 0) return null;

  const now = Date.now();
  const entry = RESPONSE_CACHE.get(cacheKey);
  if (!entry) return null;

  if (entry.expiresAt <= now) {
    RESPONSE_CACHE.delete(cacheKey);
    return null;
  }

  return entry.value;
}

export function setCachedResponse(cacheKey: string, value: AgentRoutePayload): void {
  if (!CACHE_ENABLED || CACHE_TTL_MS <= 0) return;

  const now = Date.now();
  pruneCache(now);

  RESPONSE_CACHE.set(cacheKey, {
    value,
    createdAt: now,
    expiresAt: now + CACHE_TTL_MS,
  });
}

export function getInflightRequest(cacheKey: string): Promise<AgentRoutePayload> | undefined {
  return INFLIGHT_REQUESTS.get(cacheKey);
}

export function setInflightRequest(cacheKey: string, promise: Promise<AgentRoutePayload>): void {
  INFLIGHT_REQUESTS.set(cacheKey, promise);
}

export function deleteInflightRequest(cacheKey: string): void {
  INFLIGHT_REQUESTS.delete(cacheKey);
}
