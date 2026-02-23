/**
 * MapCopilot.tsx
 *
 * The floating chat panel that lets users control the map via natural language.
 * Sends messages to /api/map-agent, receives tool calls, and executes them
 * against the MapLibre map instance.
 *
 * Styled with Tailwind CSS.
 */

'use client';

import React, { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import type { Map as MaplibreMap } from 'maplibre-gl';
import ChatMessageComponent from './ChatMessage';
import { ChatMessage, AgentResponse, generateId } from '@/lib/openai';
import { executeTool, ToolResult } from '@/lib/mapTools';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognitionLike, ev: Event) => unknown) | null;
  onend: ((this: SpeechRecognitionLike, ev: Event) => unknown) | null;
  onresult: ((this: SpeechRecognitionLike, ev: SpeechRecognitionEventLike) => unknown) | null;
  onerror: ((this: SpeechRecognitionLike, ev: SpeechRecognitionErrorEventLike) => unknown) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtorLike = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtorLike;
    webkitSpeechRecognition?: SpeechRecognitionCtorLike;
  }
}

interface Props {
  mapRef: React.RefObject<MaplibreMap | null>;
}

function combineVoiceAndTypedInput(baseText: string, transcript: string): string {
  const base = baseText.trim();
  const speech = transcript.trim();

  if (!base) return speech;
  if (!speech) return base;
  return `${base} ${speech}`;
}

export default function MapCopilot({ mapRef }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: generateId(),
      role: 'assistant',
      content:
        '👋 Chào bạn! Mình là GTEL Maps Copilot.\nMình có thể giúp bạn tìm địa điểm, chỉ đường theo phương tiện và tìm địa điểm lân cận.\n\nBạn có thể thử: "Tìm quán cà phê gần đây trong bán kính 1000m".',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isLoadingRef = useRef(false);
  const sendMessageRef = useRef<(userText: string) => Promise<void>>(async () => undefined);
  const voiceBaseInputRef = useRef('');
  const voiceCurrentInputRef = useRef('');
  const autoSendVoiceRef = useRef(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // ── Send Message ─────────────────────────────────────────────────

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

      // Add user message
      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      };

      // Add loading indicator
      const loadingMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMsg, loadingMsg]);
      setInput('');
      setIsLoading(true);

      try {
        // Build conversation history for the API
        const apiMessages = [...messages, userMsg]
          .filter((m) => !m.isLoading && !m.toolCall && !m.toolResult)
          .map((m) => ({
            role: m.role,
            content: m.content,
          }));

        // Call the Map Agent API
        const response = await fetch('/api/map-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages }),
        });

        const data: AgentResponse & { error?: string } = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Không thể gọi API.');
        }

        // Remove loading indicator
        setMessages((prev) => prev.filter((m) => m.id !== loadingMsg.id));

        // Process tool calls
        if (data.toolCalls && data.toolCalls.length > 0) {
          for (const toolCall of data.toolCalls) {
            // Show tool call log
            const toolCallMsg: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              toolCall: {
                name: toolCall.name,
                arguments: toolCall.arguments,
              },
            };
            setMessages((prev) => [...prev, toolCallMsg]);

            // Execute the tool
            const result: ToolResult = await executeTool(map, toolCall.name, toolCall.arguments);

            // Show tool result
            const toolResultMsg: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              toolResult: result,
            };
            setMessages((prev) => [...prev, toolResultMsg]);
          }
        }

        // Show assistant text reply if any
        if (data.reply) {
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: 'assistant',
              content: data.reply,
              timestamp: Date.now(),
            },
          ]);
        }
      } catch (error) {
        // Remove loading indicator
        setMessages((prev) => prev.filter((m) => m.id !== loadingMsg.id));

        // Show error
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content: `⚠️ ${error instanceof Error ? error.message : 'Đã xảy ra lỗi. Vui lòng thử lại.'}`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, mapRef],
  );

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setIsVoiceSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceError(null);
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const alternative = event.results[i]?.[0];
        if (alternative?.transcript) {
          transcript += `${alternative.transcript} `;
        }
      }

      const mergedInput = combineVoiceAndTypedInput(voiceBaseInputRef.current, transcript);
      voiceCurrentInputRef.current = mergedInput;
      setInput(mergedInput);
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        setVoiceError('Không nghe rõ giọng nói. Bạn thử lại nhé.');
      } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceError('Bạn chưa cấp quyền micro cho trình duyệt.');
      } else if (event.error === 'audio-capture') {
        setVoiceError('Không tìm thấy thiết bị micro.');
      } else {
        setVoiceError(`Voice input lỗi: ${event.error}`);
      }

      autoSendVoiceRef.current = false;
    };

    recognition.onend = () => {
      setIsListening(false);

      const shouldAutoSend = autoSendVoiceRef.current;
      autoSendVoiceRef.current = false;

      const finalInput = voiceCurrentInputRef.current.trim();
      if (!shouldAutoSend || !finalInput) {
        return;
      }

      if (isLoadingRef.current) {
        setInput(finalInput);
        return;
      }

      setInput(finalInput);
      void sendMessageRef.current(finalInput);
    };

    recognitionRef.current = recognition;
    setIsVoiceSupported(true);

    return () => {
      autoSendVoiceRef.current = false;
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // Ignore cleanup errors from browser speech engine.
      }
      recognitionRef.current = null;
    };
  }, []);

  const stopVoiceInput = useCallback((manualStop = false) => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }

    if (manualStop) {
      autoSendVoiceRef.current = false;
    }

    try {
      recognition.stop();
    } catch {
      // Ignore repeated stop calls.
    }
  }, []);

  const startVoiceInput = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || isLoading) {
      return;
    }

    setVoiceError(null);
    voiceBaseInputRef.current = input;
    voiceCurrentInputRef.current = input;
    autoSendVoiceRef.current = true;

    try {
      recognition.start();
    } catch (error) {
      autoSendVoiceRef.current = false;
      setVoiceError(
        error instanceof Error ? `Không thể bật voice input: ${error.message}` : 'Không thể bật voice input.',
      );
    }
  }, [input, isLoading]);

  const handleVoiceToggle = useCallback(() => {
    if (isListening) {
      stopVoiceInput(true);
      return;
    }
    startVoiceInput();
  }, [isListening, startVoiceInput, stopVoiceInput]);

  useEffect(() => {
    if (!isOpen && isListening) {
      stopVoiceInput(true);
    }
  }, [isOpen, isListening, stopVoiceInput]);

  useEffect(() => {
    if (isLoading && isListening) {
      stopVoiceInput(true);
    }
  }, [isLoading, isListening, stopVoiceInput]);

  // ── Form Submit ──────────────────────────────────────────────────

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // ── Quick Commands ───────────────────────────────────────────────

  const quickCommands = [
    'Phóng to Tp Hồ Chí Minh',
    'Tìm chợ Bến Thành',
    'Tìm quán cà phê gần đây trong bán kính 1000m',
    'Chỉ đường từ Bến Thành đến sân bay Tân Sơn Nhất',
  ];

  // ── Render ───────────────────────────────────────────────────────

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
                <span className='text-[11px] opacity-80'>
                  {isLoading ? 'Đang xử lý...' : isListening ? 'Đang nghe...' : 'Sẵn sàng'}
                </span>
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

          {/* Quick Commands (shown only when no user messages yet) */}
          {messages.filter((m) => m.role === 'user').length === 0 && (
            <div className='flex flex-wrap gap-1.5 border-t border-gray-100 px-3 py-2'>
              {quickCommands.map((cmd) => (
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
            </button>
            <button
              type='submit'
              disabled={isLoading || !input.trim()}
              aria-label='Gửi'
              className='flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[10px] border-none bg-indigo-600 text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40'
            >
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
            </button>
          </form>
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
