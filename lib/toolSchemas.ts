/**
 * toolSchemas.ts
 *
 * JSON Schema definitions for all Map Copilot tools.
 * These schemas are sent to the chat API so the model can choose
 * which tool to invoke based on the user's natural-language request.
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const MAP_TOOL_SCHEMAS: ChatCompletionTool[] = [
  // ──────────────────────────────────────────────
  // Navigation Tools
  // ──────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'searchPlace',
      description:
        'Search for a place by name and fly the map there. ' +
        'Internally uses Google Places Text Search API to return richer place metadata (name, address, rating, photo). ' +
        'Accepts any place name, address, or landmark.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'The place name or address to search (e.g. "Ben Thanh Market", "Hanoi"). ' +
              'If user asks province/city, pass only the entity/place name in query (do not pass full question).',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getDirections',
      description:
        'Find directions between two places with selected transport mode and draw the route on the map. ' +
        'Internally uses Google Directions API.',
      parameters: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            description:
              'Starting place or address (e.g. "Noi Bai Airport"). Can also be "vị trí hiện tại" / "my location".',
          },
          to: {
            type: 'string',
            description:
              'Destination place or address (e.g. "Hoan Kiem Lake"). Can also be "vị trí hiện tại" / "my location".',
          },
          mode: {
            type: 'string',
            description:
              'Transport mode. Use one of: "driving", "walking", "bicycling", "transit", "motorbike". ' +
              'If omitted, default is "driving".',
            enum: ['driving', 'walking', 'bicycling', 'transit', 'motorbike'],
          },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'nearbySearch',
      description:
        'Find nearby places around a location. ' +
        'Uses Google Places Nearby Search for common POIs, and GTEL Maps Nearby Search when searching traffic cameras. ' +
        'Use keyword and/or place type, with optional radius. ' +
        'Supports optional result count limit via `limit` when user explicitly asks for N results. ' +
        'Supports rating filter with minRating (for example: >= 4 stars). ' +
        'The map should display nearby markers and a radius buffer area. ' +
        'At least one of keyword or type should be provided. ' +
        'For follow-up filters (e.g. "chỉ lấy trên 4 sao"), reuse previous nearby context.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Free-text keyword to search nearby (e.g. "cruise", "coffee", "sushi").',
          },
          type: {
            type: 'string',
            description:
              'Place type filter. Example: "restaurant", "cafe", "hospital", "atm", "hotel", "traffic_camera".',
            enum: [
              'traffic_camera',
              'restaurant',
              'cafe',
              'hotel',
              'hospital',
              'school',
              'atm',
              'pharmacy',
              'bank',
              'store',
              'gas_station',
              'tourist_attraction',
              'airport',
              'shopping_mall',
              'supermarket',
            ],
          },
          location: {
            type: 'string',
            description:
              'Center location text. Can be a place name/address, "vị trí hiện tại" / "my location". If omitted, use current map center.',
          },
          radius: {
            type: 'number',
            description: 'Search radius in meters (100-50000). Default 1000.',
          },
          minRating: {
            type: 'number',
            description:
              'Minimum rating filter from 0 to 5 (e.g. 4 means only places rated 4.0+).',
          },
          limit: {
            type: 'number',
            description:
              'Number of results to display when user asks for a specific quantity (e.g. 5 for "tìm 5 quán cafe"). ' +
              'If user does not ask quantity, omit this field.',
          },
        },
        required: [],
      },
    },
  },

  // ──────────────────────────────────────────────
  // HR / Employee Tools
  // ──────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'askHR',
      description:
        'Tra cứu thông tin nhân sự công ty GTEL OTS. ' +
        'Trả lời các câu hỏi về nhân viên, chấm công, phòng ban, chức vụ, giờ làm việc, v.v. ' +
        'Nếu có tọa độ hoặc địa chỉ chấm công trong kết quả, sẽ hiển thị vị trí trên bản đồ.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description:
              'Câu hỏi về nhân sự (ví dụ: "Nhân viên A đã chấm công chưa?", ' +
              '"Thông tin chấm công phòng GIS", "Ai chưa chấm công hôm nay?").',
          },
        },
        required: ['question'],
      },
    },
  },

  // ──────────────────────────────────────────────
  // Map Utilities
  // ──────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'getUserLocation',
      description:
        "Get and fly to the user's current GPS location using the browser Geolocation API.",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getMapCenter',
      description: 'Return the current center coordinates (lng, lat) and zoom level of the map.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];
