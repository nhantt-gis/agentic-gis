# 🌐 GTEL Maps — AI Copilot

> Control a web map with natural language using OpenRouter function calling + MapLibre.

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![MapLibre](https://img.shields.io/badge/MapLibre_GL-4-orange)
![OpenRouter](https://img.shields.io/badge/OpenRouter-LLM_Router-0ea5e9)

---

## 🎯 What This Demo Does

GTEL Maps Copilot is an Agentic GIS demo where users can type or speak commands.
The model does not manipulate the map directly.
It selects tools, the frontend executes them on MapLibre, then the assistant returns a user-friendly answer.

---

## 🏗️ Architecture

```text
User (chat/voice)
   ↓
First AI pass (function calling)
   ↓
Tool calls (searchPlace / getDirections / nearbySearch / ...)
   ↓
Frontend executes tools on MapLibre
   ↓
Second AI pass (responseOnly): summarize final answer from tool outputs
```

### How It Works

1. User sends a message in chat (or voice input).
2. Frontend sends message to `/api/map-agent` endpoint to get tool calls (with caching).
3. Model returns tool calls.
4. Frontend executes tools and updates map.
5. Frontend sends tool outputs back for a grounded final response (`responseOnly` mode).
6. Chat shows only user-facing answer (technical tool logs are hidden).

---

## ✅ Key Features

- OpenRouter (OpenAI-compatible) function calling.
- In-memory cache for `/api/map-agent`.
- Voice input (Web Speech API, best on Chrome/Edge).
- Google Places Text Search for rich place info (name, address, rating, photo).
- Google Directions for route drawing (driving/walking/bicycling/transit/motorbike fallback).
- Nearby search with:
  - radius buffer rendering on map,
  - strict in-buffer filtering,
  - rating filter via `minRating`,
- Chat response synchronized with map state via second-pass grounded synthesis.

---

## 🚀 Quick Start

### 1. Install

```bash
npm install
```

### 2. Configure `.env`

```bash
cp .env.example .env
```

Required variables:

```env
OPENROUTER_API_KEY=sk-or-your-real-api-key
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_APP_NAME=GTEL Maps Copilot

NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-key
NEXT_PUBLIC_GTEL_MAPS_API_KEY=your-gtel-maps-key

MAP_AGENT_CACHE_ENABLED=true
MAP_AGENT_CACHE_TTL_MS=300000
MAP_AGENT_CACHE_MAX_ENTRIES=200
```

### 3. Run

```bash
npm run dev
```

Open: `http://localhost:3000/maps`

---

## 💬 Demo Commands

### Quick (single command)

1. `Tìm Bitexco`
2. `Xem ranh giới của Tp Hồ Chí Minh`
3. `Công ty GTEL OTS ở phường xã nào?`
4. `Tìm quán cafe cách tôi 500m`
5. `Chỉ đường từ Bến Thành đến sân bay Tân Sơn Nhất bằng xe buýt`

### Flow (linked commands)

Flow 1:

1. `Tìm bãi đỗ xe gần chợ Bến Thành trong bán kính 500m`
2. `Chỉ lấy các điểm trên 4 sao`
3. `Tăng bán kính lên 1km`
4. `Giữ nguyên khu vực này nhưng đổi sang trung tâm thương mại`
5. `Lọc lại từ 4.5 sao trở lên`

Flow 2:

1. `Chỉ đường từ Bến xe Bến Thành đến Landmark 81 bằng ô tô`
2. `Đổi sang di chuyển bằng xe buýt`
3. `Tìm công viên gần điểm đến`
4. `Chỉ lấy công viên trên 4 sao`

Flow 3:

1. `Xem ranh giới của Tp Hồ Chí Minh`
2. `Trong đó, ủy ban nhân dân thành phố đặt tại đâu?`
3. `Có những địa điểm tham quan nổi tiểng nào gần đó trong bán kính 1km?`
4. `Chỉ đường từ UBND đến Dinh Độc Lập bằng ô tô`

Flow 4:

1. `Gần tôi có camera giao thông nào không?`
2. `Chỉ lấy 3 camera gần nhất và xem hình ảnh trực tiếp từ chúng`
3. `Chỉ đường từ vị trí hiện tại đến vị trí camera gần nhất bằng xe máy`

Flow 5

1. `Xem trụ sở chính công ty GTEL OTS`
2. `Công ty GTEL OTS có bao nhiêu nhân viên?`
3. `Lãnh đạo công ty GTEL OTS gồm những ai?`
4. `Ai là GIS Team Leader của GTEL OTS?`
5. `Các thành viên trong team GIS là ai?`
6. `Hôm nay họ có đi làm không? Đã chấm công chưa? Khi nào? Ở đâu?`

---

## 🧰 Tool Contracts

| Tool                                                                    | Purpose                                                               |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `searchPlace(query)`                                                    | Find place with Google Places Text Search and fly map to it           |
| `getDirections(from, to, mode?)`                                        | Draw route with Google Directions API                                 |
| `nearbySearch(keyword?, type?, location?, radius?, minRating?, limit?)` | Nearby places + radius buffer + optional rating filter + result limit |
| `getUserLocation()`                                                     | Fly to browser GPS location                                           |
| `getMapCenter()`                                                        | Return current map center + zoom                                      |

---

## 📁 Project Structure

```text
app/
  api/map-agent/route.ts   ← OpenRouter API endpoint (cache + inflight dedup)
  maps/page.tsx            ← full-screen map + chat panel
types/
  index.ts                ← shared TypeScript types (ChatMessage, ToolResult, ...)
hooks/
  useSpeechRecognition.ts ← Web Speech API hook (extracted from MapCopilot)
lib/
  prompts.ts              ← REQUEST_PROMPT and RESPONSE_PROMPT
  toolSchemas.ts          ← OpenAI function-calling schemas
  cache.ts                ← in-memory LRU + TTL cache with inflight deduplication
  utils.ts                ← shared utilities (generateId, ...)
  map/
    constants.ts          ← API URLs, layer IDs, defaults, labels
    state.ts              ← shared mutable map state (markers, nearby context)
    geo.ts                ← pure geo helpers (haversine, polyline decode, buffer, ...)
    gtel-api.ts           ← GTEL Maps Platform API calls (optional, can be mocked)
    google-api.ts         ← Google Places / Directions API calls
    popup.ts              ← HTML rendering for popups and marker elements
    visuals.ts            ← MapLibre layer/source and marker management
    tools.ts              ← tool implementations (searchPlace, getDirections, ...)
    index.ts              ← public re-exports for map module
components/
  MapView.tsx             ← react-map-gl map with controls
  MapCopilot.tsx          ← floating chat panel
  ChatMessage.tsx         ← single message bubble (memoized)
```

---

## 🛠️ Tech Stack

- Next.js 14 (App Router)
- TypeScript 5 (strict)
- Tailwind CSS v4
- React Map GL + MapLibre GL JS v5
- Google Places API (Text Search + Nearby Search)
- Google Directions API
- OpenRouter (OpenAI-compatible chat completions)
- Web Speech API (voice input)

---

## 🗺️ Roadmap

- [x] Context caching
- [x] BE tool call execution
- [ ] FE tool call execution + map updates
- [x] Voice input
- [x] Routing & directions
- [x] Nearby search
- [x] Geocoding

---

## 📝 License

Internal demo — GTEL Maps Platform Team.
