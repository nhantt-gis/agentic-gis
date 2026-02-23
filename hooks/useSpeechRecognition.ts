/**
 * Custom hook for browser Speech Recognition (Web Speech API).
 * Handles setup, interim results, auto-send on voice end,
 * and cleanup when the panel closes or a request is in-flight.
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ── Browser Speech Recognition Types ─────────────────────────────────

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

// ── Hook Interface ───────────────────────────────────────────────────

interface UseSpeechRecognitionOptions {
  /** Current typed input value */
  input: string;
  /** Setter for the input value */
  setInput: (value: string) => void;
  /** Whether the chat agent is currently processing */
  isLoading: boolean;
  /** Whether the chat panel is open */
  isOpen: boolean;
  /** Called with final transcript to send as a message */
  sendMessage: (text: string) => Promise<void>;
}

interface UseSpeechRecognitionReturn {
  isVoiceSupported: boolean;
  isListening: boolean;
  voiceError: string | null;
  handleVoiceToggle: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

function combineVoiceAndTypedInput(baseText: string, transcript: string): string {
  const base = baseText.trim();
  const speech = transcript.trim();
  if (!base) return speech;
  if (!speech) return base;
  return `${base} ${speech}`;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useSpeechRecognition({
  input,
  setInput,
  isLoading,
  isOpen,
  sendMessage,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isLoadingRef = useRef(isLoading);
  const sendMessageRef = useRef(sendMessage);
  const voiceBaseInputRef = useRef('');
  const voiceCurrentInputRef = useRef('');
  const autoSendVoiceRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window === 'undefined') return;

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
      const errorMessages: Record<string, string> = {
        'no-speech': 'Không nghe rõ giọng nói. Bạn thử lại nhé.',
        'not-allowed': 'Bạn chưa cấp quyền micro cho trình duyệt.',
        'service-not-allowed': 'Bạn chưa cấp quyền micro cho trình duyệt.',
        'audio-capture': 'Không tìm thấy thiết bị micro.',
      };
      setVoiceError(errorMessages[event.error] || `Voice input lỗi: ${event.error}`);
      autoSendVoiceRef.current = false;
    };

    recognition.onend = () => {
      setIsListening(false);

      const shouldAutoSend = autoSendVoiceRef.current;
      autoSendVoiceRef.current = false;

      const finalInput = voiceCurrentInputRef.current.trim();
      if (!shouldAutoSend || !finalInput) return;

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopVoiceInput = useCallback((manualStop = false) => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (manualStop) autoSendVoiceRef.current = false;
    try {
      recognition.stop();
    } catch {
      // Ignore repeated stop calls.
    }
  }, []);

  const startVoiceInput = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || isLoading) return;

    setVoiceError(null);
    voiceBaseInputRef.current = input;
    voiceCurrentInputRef.current = input;
    autoSendVoiceRef.current = true;

    try {
      recognition.start();
    } catch (error) {
      autoSendVoiceRef.current = false;
      setVoiceError(
        error instanceof Error
          ? `Không thể bật voice input: ${error.message}`
          : 'Không thể bật voice input.',
      );
    }
  }, [input, isLoading]);

  const handleVoiceToggle = useCallback(() => {
    if (isListening) {
      stopVoiceInput(true);
    } else {
      startVoiceInput();
    }
  }, [isListening, startVoiceInput, stopVoiceInput]);

  // Stop voice when panel closes or loading starts
  useEffect(() => {
    if ((!isOpen || isLoading) && isListening) {
      stopVoiceInput(true);
    }
  }, [isOpen, isLoading, isListening, stopVoiceInput]);

  return { isVoiceSupported, isListening, voiceError, handleVoiceToggle };
}
