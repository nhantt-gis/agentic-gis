/**
 * MapCopilot.tsx
 *
 * Floating chat panel for controlling the map via natural language.
 * Sends messages to /api/map-agent, receives tool calls, and executes
 * them against the MapLibre map instance.
 */

'use client';

import React, { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import type { Map as MaplibreMap } from 'maplibre-gl';

import ChatMessageComponent from './ChatMessage';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import type { ChatMessage, AgentResponse, AgentApiMessage, ToolResult } from '@/types';
import { generateId } from '@/lib/utils';
import { executeTool } from '@/lib/map';

// ── Constants ────────────────────────────────────────────────────────

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '👋 Chào bạn! Mình là GTEL Maps Copilot.\nMình có thể giúp bạn tìm địa điểm, chỉ đường theo phương tiện và tìm địa điểm lân cận.\n\nBạn có thể thử: "Tìm quán cà phê gần đây".',
  timestamp: Date.now(),
};

const QUICK_COMMANDS = [
  'Công ty GTEL OTS ở tỉnh thành nào?',
  'Vị trí hiện tại của tôi?',
  'Chỉ đường đến sân bay Tân Sơn Nhất',
  'Quán cafe gần nhất',
] as const;

// ── Icons ────────────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <path d='M12 1a3 3 0 0 0-3 3v8a3 3 0 1 0 6 0V4a3 3 0 0 0-3-3z' />
      <path d='M19 10v2a7 7 0 0 1-14 0v-2' />
      <line x1='12' y1='19' x2='12' y2='23' />
      <line x1='8' y1='23' x2='16' y2='23' />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width='18'
      height='18'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <line x1='22' y1='2' x2='11' y2='13' />
      <polygon points='22 2 15 22 11 13 2 9 22 2' />
    </svg>
  );
}

// ── Props ────────────────────────────────────────────────────────────

interface MapCopilotProps {
  mapRef: React.RefObject<MaplibreMap | null>;
}

// ── Component ────────────────────────────────────────────────────────

export default function MapCopilot({ mapRef }: MapCopilotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // ── API Interaction ────────────────────────────────────────────────

  const callMapAgent = useCallback(
    async (apiMessages: AgentApiMessage[], responseOnly = false): Promise<AgentResponse> => {
      const response = await fetch('/api/map-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, responseOnly }),
      });

      const data: AgentResponse & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể gọi API.');
      return data;
    },
    [],
  );

  // ── Send Message ───────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isLoading) return;

      const map = mapRef.current;
      if (!map) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content: 'Bản đồ chưa sẵn sàng. Vui lòng đợi một chút.',
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      };

      const loadingId = generateId();
      const loadingMsg: ChatMessage = {
        id: loadingId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMsg, loadingMsg]);
      setInput('');
      setIsLoading(true);

      try {
        // Build conversation history (exclude UI-only messages)
        const apiMessages: AgentApiMessage[] = [...messages, userMsg]
          .filter((m) => !m.isLoading && !m.toolCall && !m.toolResult)
          .map((m) => ({ role: m.role, content: m.content }));

        // First pass: tool planning
        const data = await callMapAgent(apiMessages, false);

        const executedTools: Array<{
          id?: string;
          name: string;
          arguments: Record<string, unknown>;
          result: ToolResult;
        }> = [];

        // Execute tool calls
        if (data.toolCalls?.length) {
          for (const toolCall of data.toolCalls) {
            const result = await executeTool(map, toolCall.name, toolCall.arguments);
            executedTools.push({
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments,
              result,
            });
          }
        }

        let finalReply = data.reply?.trim() || '';

        // Second pass: AI summarizes a grounded answer from tool outputs
        if (executedTools.length > 0) {
          const groundedPrompt = `Yêu cầu gần nhất của người dùng: "${userText}".
            Dữ liệu công cụ vừa chạy:
            ${JSON.stringify(executedTools, null, 2)}
            Hãy trả lời đúng trọng tâm yêu cầu gần nhất dựa trên dữ liệu này.`;

          try {
            const grounded = await callMapAgent(
              [
                ...apiMessages,
                { role: 'assistant', content: 'Đã thực thi công cụ và có dữ liệu kết quả.' },
                { role: 'user', content: groundedPrompt },
              ],
              true,
            );

            if (grounded.reply?.trim()) {
              finalReply = grounded.reply.trim();
            }
          } catch (error) {
            console.error('[map-copilot] response-only synthesis error:', error);
          }
        }

        if (!finalReply) {
          const failedTool = executedTools.find((item) => !item.result.success);
          finalReply = failedTool
            ? failedTool.result.message
            : executedTools.length > 0
              ? 'Mình đã xử lý xong yêu cầu trên bản đồ.'
              : '';
        }

        // Replace loading with final reply
        setMessages((prev) => {
          const withoutLoading = prev.filter((m) => m.id !== loadingId);
          if (!finalReply) return withoutLoading;
          return [
            ...withoutLoading,
            {
              id: generateId(),
              role: 'assistant' as const,
              content: finalReply,
              timestamp: Date.now(),
            },
          ];
        });
      } catch (error) {
        setMessages((prev) => {
          const withoutLoading = prev.filter((m) => m.id !== loadingId);
          return [
            ...withoutLoading,
            {
              id: generateId(),
              role: 'assistant' as const,
              content: `⚠️ ${error instanceof Error ? error.message : 'Đã xảy ra lỗi. Vui lòng thử lại.'}`,
              timestamp: Date.now(),
            },
          ];
        });
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, mapRef, callMapAgent],
  );

  // ── Speech Recognition ─────────────────────────────────────────────

  const { isVoiceSupported, isListening, voiceError, handleVoiceToggle } = useSpeechRecognition({
    input,
    setInput,
    isLoading,
    isOpen,
    sendMessage,
  });

  // ── Form Submit ────────────────────────────────────────────────────

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const hasUserMessages = messages.some((m) => m.role === 'user');
  const statusText = isLoading ? 'Đang xử lý...' : isListening ? 'Đang nghe...' : 'Sẵn sàng';

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <>
      {/* Toggle Button */}
      {!isOpen && (
        <button
          className='fixed bottom-6 right-6 z-1000 flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(79,70,229,0.4)] transition-all hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-[0_6px_24px_rgba(79,70,229,0.5)]'
          onClick={() => setIsOpen(true)}
        >
          <span className='text-lg'>🤖</span>
          <span>Map Copilot</span>
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className='fixed bottom-6 right-6 z-1000 flex w-100 max-h-[calc(100vh-48px)] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] max-[480px]:bottom-2 max-[480px]:right-2 max-[480px]:w-[calc(100vw-16px)] max-[480px]:max-h-[calc(100vh-16px)]'>
          {/* Header */}
          <div className='flex items-center justify-between bg-linear-to-br from-indigo-600 to-violet-600 p-3 text-white'>
            <div className='flex items-center gap-2.5'>
              <span className='text-2xl'>🤖</span>
              <div className='flex flex-col gap-1'>
                <h3 className='m-0 text-[15px] font-bold tracking-tight'>GTEL Maps Copilot</h3>
                <span className='text-[11px] opacity-80'>{statusText}</span>
              </div>
            </div>
            <button
              className='flex h-7 w-7 items-center justify-center rounded-lg border-none bg-white/15 text-sm text-white transition-colors hover:bg-white/25'
              onClick={() => setIsOpen(false)}
              aria-label='Đóng'
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div
            className='flex-1 overflow-y-auto py-2 min-h-50 max-h-112.5 scrollbar-thin scrollbar-thumb-gray-300'
            ref={scrollRef}
          >
            {messages.map((msg) => (
              <ChatMessageComponent key={msg.id} message={msg} />
            ))}
          </div>

          {/* Quick Commands */}
          {!hasUserMessages && (
            <div className='flex flex-wrap gap-1.5 border-t border-gray-100 px-3 py-2'>
              {QUICK_COMMANDS.map((cmd) => (
                <button
                  key={cmd}
                  className='whitespace-nowrap rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[11.5px] text-gray-600 transition-all hover:bg-gray-200 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50'
                  onClick={() => sendMessage(cmd)}
                  disabled={isLoading}
                >
                  {cmd}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            className='flex items-center gap-2 border-t border-gray-100 p-3'
            onSubmit={handleSubmit}
          >
            <input
              ref={inputRef}
              type='text'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Hãy yêu cầu mình điều khiển bản đồ...'
              disabled={isLoading || isListening}
              aria-label='Ô nhập chat'
              className='flex-1 rounded-[10px] border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[13.5px] outline-none transition-colors focus:border-indigo-600 focus:bg-white disabled:opacity-60'
            />
            <button
              type='button'
              onClick={handleVoiceToggle}
              disabled={!isVoiceSupported || isLoading}
              aria-label={isListening ? 'Dừng nhập giọng nói' : 'Bật nhập giọng nói'}
              title={
                !isVoiceSupported
                  ? 'Trình duyệt chưa hỗ trợ nhập giọng nói'
                  : isListening
                    ? 'Dừng nhập giọng nói'
                    : 'Nhấn để nói'
              }
              className={`flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[10px] border-none text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                isListening ? 'bg-rose-500 hover:bg-rose-600' : 'bg-sky-500 hover:bg-sky-600'
              }`}
            >
              <MicIcon />
            </button>
            <button
              type='submit'
              disabled={isLoading || !input.trim()}
              aria-label='Gửi'
              className='flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[10px] border-none bg-indigo-600 text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40'
            >
              <SendIcon />
            </button>
          </form>

          {/* Voice Error */}
          {(voiceError || !isVoiceSupported) && (
            <div className='border-t border-gray-100 p-3 text-[12px] text-rose-600'>
              {voiceError || 'Trình duyệt hiện tại chưa hỗ trợ nhập giọng nói.'}
            </div>
          )}
        </div>
      )}
    </>
  );
}
