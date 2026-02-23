/**
 * Shared type definitions for the Map Copilot application.
 */

// ── Chat Types ───────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** A single chat message displayed in the UI */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  /** If this message represents a tool-call request */
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  /** If this message contains a tool execution result */
  toolResult?: {
    success: boolean;
    message: string;
    data?: Record<string, unknown>;
  };
  /** Loading state for assistant messages */
  isLoading?: boolean;
}

/** Tool call returned by the LLM */
export interface ToolCallResponse {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** API response shape from /api/map-agent */
export interface AgentResponse {
  reply: string;
  toolCalls: ToolCallResponse[];
}

// ── Map Tool Types ───────────────────────────────────────────────────

/** Result returned by every map tool execution */
export interface ToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export type DirectionsMode = 'driving' | 'walking' | 'bicycling' | 'transit' | 'motorbike';

export type NearbyPlaceType =
  | 'restaurant'
  | 'cafe'
  | 'hotel'
  | 'hospital'
  | 'school'
  | 'atm'
  | 'pharmacy'
  | 'bank'
  | 'store'
  | 'gas_station'
  | 'tourist_attraction'
  | 'airport'
  | 'shopping_mall'
  | 'supermarket';

// ── API Route Types ──────────────────────────────────────────────────

export interface AgentApiMessage {
  role: MessageRole;
  content: string;
  tool_call_id?: string;
}

export interface AgentRequestBody {
  messages: AgentApiMessage[];
  responseOnly?: boolean;
}

export interface ToolCallPayload {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentRoutePayload {
  reply: string;
  toolCalls: ToolCallPayload[];
  finishReason: string | null;
}
