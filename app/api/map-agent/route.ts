/**
 * /api/map-agent  –  Map Copilot API Route
 *
 * Accepts the user's chat history, forwards it to OpenRouter (OpenAI-compatible)
 * with function-calling schemas, and returns either a text reply or a list of
 * tool calls for the frontend to execute against the MapLibre map instance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { MAP_TOOL_SCHEMAS } from '@/lib/toolSchemas';
import { SYSTEM_PROMPT } from '@/lib/openai';

// ── OpenRouter Client (lazy initialization to avoid build-time errors) ──

let _openrouter: OpenAI | null = null;

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || 'GTEL Maps Copilot';
const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL || 'http://localhost:3000';

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const MAP_AGENT_CACHE_ENABLED = process.env.MAP_AGENT_CACHE_ENABLED !== 'false';
const MAP_AGENT_CACHE_TTL_MS = parseNumberEnv(process.env.MAP_AGENT_CACHE_TTL_MS, 5 * 60 * 1000);
const MAP_AGENT_CACHE_MAX_ENTRIES = parseNumberEnv(process.env.MAP_AGENT_CACHE_MAX_ENTRIES, 200);

function getOpenRouterClient(apiKey: string): OpenAI {
  if (!_openrouter) {
    _openrouter = new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': OPENROUTER_SITE_URL,
        'X-Title': OPENROUTER_APP_NAME,
      },
    });
  }
  return _openrouter;
}

// ── Request / Response Types ─────────────────────────────────────────

interface IncomingMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
}

interface RequestBody {
  messages: IncomingMessage[];
}

interface ToolCallPayload {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface AgentRoutePayload {
  reply: string;
  toolCalls: ToolCallPayload[];
  finishReason: string | null;
}

interface CacheEntry {
  value: AgentRoutePayload;
  createdAt: number;
  expiresAt: number;
}

const RESPONSE_CACHE = new Map<string, CacheEntry>();
const INFLIGHT_REQUESTS = new Map<string, Promise<AgentRoutePayload>>();

function safeParseJsonObject(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function buildCacheKey(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): string {
  const payload = JSON.stringify({
    model: OPENROUTER_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    messages,
  });

  return createHash('sha256').update(payload).digest('hex');
}

function pruneCache(now: number): void {
  const expiredKeys: string[] = [];
  RESPONSE_CACHE.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      expiredKeys.push(key);
    }
  });

  for (let i = 0; i < expiredKeys.length; i += 1) {
    RESPONSE_CACHE.delete(expiredKeys[i]);
  }

  if (RESPONSE_CACHE.size <= MAP_AGENT_CACHE_MAX_ENTRIES) {
    return;
  }

  const entriesByAge = Array.from(RESPONSE_CACHE.entries()).sort(
    (a, b) => a[1].createdAt - b[1].createdAt,
  );
  const removeCount = RESPONSE_CACHE.size - MAP_AGENT_CACHE_MAX_ENTRIES;

  for (let i = 0; i < removeCount; i += 1) {
    const key = entriesByAge[i]?.[0];
    if (key) {
      RESPONSE_CACHE.delete(key);
    }
  }
}

function getCachedResponse(cacheKey: string): AgentRoutePayload | null {
  if (!MAP_AGENT_CACHE_ENABLED || MAP_AGENT_CACHE_TTL_MS <= 0) {
    return null;
  }

  const now = Date.now();
  const entry = RESPONSE_CACHE.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= now) {
    RESPONSE_CACHE.delete(cacheKey);
    return null;
  }

  return entry.value;
}

function setCachedResponse(cacheKey: string, value: AgentRoutePayload): void {
  if (!MAP_AGENT_CACHE_ENABLED || MAP_AGENT_CACHE_TTL_MS <= 0) {
    return;
  }

  const now = Date.now();
  pruneCache(now);

  RESPONSE_CACHE.set(cacheKey, {
    value,
    createdAt: now,
    expiresAt: now + MAP_AGENT_CACHE_TTL_MS,
  });
}

// ── Route Handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'OPENROUTER_API_KEY chưa được cấu hình. Vui lòng thêm vào file .env.local hoặc .env.',
        },
        { status: 500 },
      );
    }

    const body: RequestBody = await request.json();

    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json(
        { error: 'Yêu cầu không hợp lệ: cần có mảng messages.' },
        { status: 400 },
      );
    }

    // Build conversation for OpenRouter
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...body.messages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool' as const,
            content: m.content,
            tool_call_id: m.tool_call_id || '',
          };
        }
        return {
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        };
      }),
    ];

    const cacheKey = buildCacheKey(messages);
    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse) {
      return NextResponse.json({
        ...cachedResponse,
        cached: true,
        cacheSource: 'memory',
      });
    }

    const inflightResponse = INFLIGHT_REQUESTS.get(cacheKey);
    if (inflightResponse) {
      const shared = await inflightResponse;
      return NextResponse.json({
        ...shared,
        cached: true,
        cacheSource: 'inflight',
      });
    }

    const completionPromise = (async (): Promise<AgentRoutePayload> => {
      // Call OpenRouter with function-calling
      const completion = await getOpenRouterClient(apiKey).chat.completions.create({
        model: OPENROUTER_MODEL,
        messages,
        tools: MAP_TOOL_SCHEMAS,
        tool_choice: 'auto',
        temperature: 0.1,
        max_tokens: 1024,
      });

      const choice = completion.choices[0];

      if (!choice) {
        throw new Error('Không nhận được phản hồi từ OpenRouter.');
      }

      // Extract tool calls if any
      const toolCalls = (choice.message.tool_calls || []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseJsonObject(tc.function.arguments),
      }));

      return {
        reply: choice.message.content || '',
        toolCalls,
        finishReason: choice.finish_reason,
      };
    })();

    INFLIGHT_REQUESTS.set(cacheKey, completionPromise);

    let responsePayload: AgentRoutePayload;
    try {
      responsePayload = await completionPromise;
    } finally {
      INFLIGHT_REQUESTS.delete(cacheKey);
    }

    setCachedResponse(cacheKey, responsePayload);

    // Return structured response
    return NextResponse.json({
      ...responsePayload,
      cached: false,
    });
  } catch (error) {
    console.error('[map-agent] Error:', error);

    const message =
      error instanceof OpenAI.APIError
        ? `Lỗi OpenRouter API: ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Đã xảy ra lỗi không xác định.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
