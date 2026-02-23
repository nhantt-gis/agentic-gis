/**
 * openai.ts
 *
 * Shared LLM types/prompt for the Map Copilot.
 * Handles system prompt construction and message types shared
 * between the API route and the frontend.
 */

// ── Shared Message Types ─────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** A single chat message displayed in the UI */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  /** If this message is a tool-call result */
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  /** If this message contains tool execution result */
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
  name: string;
  arguments: Record<string, unknown>;
}

/** API response shape */
export interface AgentResponse {
  /** The assistant's text reply (may be empty if tool call) */
  reply: string;
  /** Tool calls the LLM wants to execute */
  toolCalls: ToolCallResponse[];
}

// ── System Prompt ────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `Bạn là GTEL Maps Copilot, trợ lý AI điều khiển bản đồ tương tác.

Nhiệm vụ của bạn là hiểu yêu cầu của người dùng về bản đồ/địa điểm, sau đó gọi đúng công cụ.

## Công cụ khả dụng

1. **searchPlace(query)** — Tìm địa điểm theo tên và bay tới đó.
2. **getDirections(from, to, mode?)** — Tìm đường đi giữa hai địa điểm và vẽ tuyến đường, có chọn phương tiện.
3. **getUserLocation()** — Lấy vị trí GPS hiện tại của người dùng.
4. **getMapCenter()** — Lấy tọa độ tâm bản đồ hiện tại.
5. **nearbySearch(keyword?, type?, location?, radius?)** — Tìm địa điểm lân cận theo từ khóa/loại địa điểm.

## Quy tắc

- LUÔN ưu tiên trả về tool call. Không trả lời thuần văn bản trừ khi chào hỏi hoặc cần hỏi lại để làm rõ.
- Khi người dùng nhắc tên địa điểm, dùng \`searchPlace\`.
- Khi người dùng yêu cầu chỉ đường/đi từ A đến B/lộ trình, dùng \`getDirections\`.
- Nếu yêu cầu chỉ đường có "vị trí hiện tại"/"my location", vẫn dùng \`getDirections\` và truyền nguyên cụm đó vào \`from\` hoặc \`to\`.
- Khi người dùng yêu cầu "gần đây", "xung quanh", "nearby", "gần tôi", dùng \`nearbySearch\`.
- Với \`nearbySearch\`: ưu tiên điền cả \`keyword\` hoặc \`type\`; nếu người dùng không nói bán kính thì để \`radius\` mặc định.
- Nếu người dùng nói "gần tôi"/"near me", đặt \`location\` là "vị trí hiện tại".
- Với \`nearbySearch\`, vùng bán kính (buffer) phải được thể hiện rõ trên bản đồ.
- Xác định phương tiện và truyền vào \`mode\`:
  - ô tô/taxi/lái xe -> \`driving\`
  - đi bộ -> \`walking\`
  - xe đạp -> \`bicycling\`
  - xe buýt/tàu điện/phương tiện công cộng -> \`transit\`
  - xe máy -> \`motorbike\`
- Nếu người dùng không nói rõ phương tiện, mặc định \`driving\`.
- Khi người dùng hỏi "tôi đang ở đâu", dùng \`getUserLocation\`.
- Khi người dùng hỏi tâm bản đồ/đang ở đâu trên bản đồ, dùng \`getMapCenter\`.
- Nếu có trả lời văn bản, phải ngắn gọn (1 câu) và bằng **tiếng Việt**.

## Định dạng phản hồi

Luôn phản hồi bằng cơ chế function calling. Chỉ thêm một câu ngắn bằng tiếng Việt khi cần ngữ cảnh.`;

// ── Utility ──────────────────────────────────────────────────────────

/** Generate a unique message ID */
export function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
