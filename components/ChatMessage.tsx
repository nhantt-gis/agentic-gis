/**
 * ChatMessage.tsx
 *
 * Renders a single message in the Map Copilot chat panel.
 * Supports user messages, assistant replies, tool-call logs,
 * and tool-result status indicators.
 */

'use client';

import React, { memo } from 'react';
import type { ChatMessage as ChatMessageType } from '@/types';
import { TOOL_ACTION_LABELS } from '@/lib/map';

interface ChatMessageProps {
  message: ChatMessageType;
}

const USER_BUBBLE_CLASS =
  'max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2.5 text-[13.5px] leading-snug text-white';
const ASSISTANT_BUBBLE_CLASS =
  'max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 px-3.5 py-2.5 text-[13.5px] leading-snug text-gray-800';
const ASSISTANT_HTML_CLASS =
  'm-0 wrap-break-word whitespace-normal [&_a]:break-all [&_a]:font-medium [&_a]:text-blue-700 [&_a]:underline [&_a]:underline-offset-2 [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:space-y-0.5 [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:space-y-0.5 [&_ol]:pl-5 [&_li]:my-1';

const renderAssistantBubble = (content: string, toneClass?: string) => (
  <div className='flex justify-start px-3 py-1'>
    <div className={`${ASSISTANT_BUBBLE_CLASS} ${toneClass || ''}`}>
      <p className='m-0 wrap-break-word whitespace-pre-wrap'>{content}</p>
    </div>
  </div>
);

function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

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
      <div className={isUser ? USER_BUBBLE_CLASS : ASSISTANT_BUBBLE_CLASS}>
        {isUser ? (
          <div className='m-0 wrap-break-word whitespace-pre-wrap'>{message.content}</div>
        ) : (
          <div
            className={ASSISTANT_HTML_CLASS}
            dangerouslySetInnerHTML={{ __html: message.content }}
          />
        )}
      </div>
    </div>
  );
}

export default memo(ChatMessage);
