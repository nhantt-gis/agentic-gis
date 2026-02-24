/**
 * /api/map-agent — Map Copilot API Route
 *
 * Accepts the user's chat history, forwards it to OpenRouter (OpenAI-compatible)
 * with function-calling schemas, and returns either a text reply or a list of
 * tool calls for the frontend to execute against the MapLibre map instance.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

import { MAP_TOOL_SCHEMAS } from '@/lib/toolSchemas';
import { REQUEST_PROMPT, RESPONSE_PROMPT } from '@/lib/prompts';
import type { AgentRequestBody, AgentRoutePayload } from '@/types';
import {
  buildCacheKey,
  getCachedResponse,
  setCachedResponse,
  getInflightRequest,
  setInflightRequest,
  deleteInflightRequest,
} from '@/lib/cache';

// ── OpenRouter Client ────────────────────────────────────────────────

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || 'GTEL Maps Copilot';
const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL || 'http://localhost:3000';
const OPENROUTER_TOOL_MAX_TOKENS = Number(process.env.OPENROUTER_TOOL_MAX_TOKENS || 1024);
const OPENROUTER_RESPONSE_MAX_TOKENS = Number(process.env.OPENROUTER_RESPONSE_MAX_TOKENS || 768);

let _openrouter: OpenAI | null = null;

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

// ── Helpers ──────────────────────────────────────────────────────────

function safeParseJsonObject(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function buildMessages(
  systemPrompt: string,
  incoming: AgentRequestBody['messages'],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: systemPrompt },
    ...incoming.map((m) => {
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
}

async function callLLM(
  client: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  responseOnly: boolean,
): Promise<AgentRoutePayload> {
  const completion = responseOnly
    ? await client.chat.completions.create({
        model: OPENROUTER_MODEL,
        messages,
        temperature: 0.1,
        max_tokens: OPENROUTER_RESPONSE_MAX_TOKENS,
      })
    : await client.chat.completions.create({
        model: OPENROUTER_MODEL,
        messages,
        tools: MAP_TOOL_SCHEMAS,
        tool_choice: 'auto',
        temperature: 0.1,
        max_tokens: OPENROUTER_TOOL_MAX_TOKENS,
      });

  const choice = completion.choices[0];
  if (!choice) throw new Error('Không nhận được phản hồi từ OpenRouter.');

  const toolCalls = responseOnly
    ? []
    : (choice.message.tool_calls || []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseJsonObject(tc.function.arguments),
      }));

  return {
    reply: choice.message.content || '',
    toolCalls,
    finishReason: choice.finish_reason,
  };
}

// ── Route Handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY chưa được cấu hình. Vui lòng thêm vào file .env.local hoặc .env.' },
        { status: 500 },
      );
    }

    const body: AgentRequestBody = await request.json();

    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json(
        { error: 'Yêu cầu không hợp lệ: cần có mảng messages.' },
        { status: 400 },
      );
    }

    const responseOnly = body.responseOnly === true;
    const systemPrompt = responseOnly ? RESPONSE_PROMPT : REQUEST_PROMPT;
    const messages = buildMessages(systemPrompt, body.messages);

    // ── Cache check ──────────────────────────────────────────────────

    const cacheKey = buildCacheKey(messages);

    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true, cacheSource: 'memory' });
    }

    const inflight = getInflightRequest(cacheKey);
    if (inflight) {
      const shared = await inflight;
      return NextResponse.json({ ...shared, cached: true, cacheSource: 'inflight' });
    }

    // ── LLM call with inflight deduplication ─────────────────────────

    const completionPromise = callLLM(getOpenRouterClient(apiKey), messages, responseOnly);
    setInflightRequest(cacheKey, completionPromise);

    let responsePayload: AgentRoutePayload;
    try {
      responsePayload = await completionPromise;
    } finally {
      deleteInflightRequest(cacheKey);
    }

    setCachedResponse(cacheKey, responsePayload);

    return NextResponse.json({ ...responsePayload, cached: false });
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
