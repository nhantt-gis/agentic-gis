/**
 * ChatMessage.tsx
 *
 * Renders a single message in the Map Copilot chat panel.
 * Supports user messages, assistant replies, tool-call logs,
 * and tool-result status indicators.
 *
 * Styled with Tailwind CSS.
 */

'use client';

import React from 'react';
import { ChatMessage as ChatMessageType } from '@/lib/openai';
import { TOOL_ACTION_LABELS } from '@/lib/mapTools';

interface Props {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';
  const userBubbleClass =
    'max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2.5 text-[13.5px] leading-snug text-white';
  const assistantBubbleClass =
    'max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 px-3.5 py-2.5 text-[13.5px] leading-snug text-gray-800';

  const renderAssistantBubble = (content: string, toneClass?: string) => (
    <div className='flex justify-start px-3 py-1'>
      <div className={`${assistantBubbleClass} ${toneClass || ''}`}>
        <p className='m-0 whitespace-pre-wrap wrap-break-word'>{content}</p>
      </div>
    </div>
  );

  // ── Tool Call Log ────────────────────────────────────────────────
  if (message.toolCall) {
    const action =
      TOOL_ACTION_LABELS[message.toolCall.name] || `xử lý yêu cầu (${message.toolCall.name})`;
    return renderAssistantBubble(`⏳ Mình đang ${action}...`);
  }

  // ── Tool Result ──────────────────────────────────────────────────
  if (message.toolResult) {
    const ok = message.toolResult.success;
    const prefix = ok ? '✅ ' : '⚠️ ';
    return renderAssistantBubble(
      `${prefix}${message.toolResult.message}`,
      ok ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900',
    );
  }

  // ── Loading bubble ───────────────────────────────────────────────
  if (message.isLoading) {
    return (
      <div className='flex justify-start px-3 py-1.5'>
        <div className='rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-3'>
          <div className='flex items-center gap-1'>
            <span className='animate-bounce-dot h-1.5 w-1.5 rounded-full bg-gray-400' />
            <span className='animate-bounce-dot h-1.5 w-1.5 rounded-full bg-gray-400 [animation-delay:0.2s]' />
            <span className='animate-bounce-dot h-1.5 w-1.5 rounded-full bg-gray-400 [animation-delay:0.4s]' />
          </div>
        </div>
      </div>
    );
  }

  // ── User / Assistant Bubble ──────────────────────────────────────
  return (
    <div className={`flex px-3 py-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={isUser ? userBubbleClass : assistantBubbleClass}>
        <p className='m-0 whitespace-pre-wrap wrap-break-word'>{message.content}</p>
      </div>
    </div>
  );
}
