# 🌐 GTEL Maps — AI Copilot

> **Control your map with natural language.** An agentic GIS demo that turns user queries into real map actions using OpenRouter function calling and MapLibre GL JS.

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![MapLibre](https://img.shields.io/badge/MapLibre_GL-4-orange)
![OpenRouter](https://img.shields.io/badge/OpenRouter-LLM_Router-0ea5e9)

---

## 🎯 What Is This?

GTEL Maps AI Copilot is a demonstration of an **Agentic GIS** system — a web map that can be controlled entirely through natural language. Users type commands like _"Zoom to Hanoi"** or **"Go to Ben Thanh Market"_, and the AI figures out which map tool to call.

**This is NOT a chatbot that returns text.** The AI produces structured **function calls** that directly manipulate the map.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│            Next.js Frontend                 │
│   ┌───────────┐    ┌──────────────────┐     │
│   │ MapLibre   │    │  Map Copilot     │     │
│   │ GL Map     │◄───│  Chat Panel      │     │
│   └───────────┘    └───────┬──────────┘     │
│                           │                 │
│                     user message            │
│                           │                 │
│              ┌────────────▼────────────┐    │
│              │  /api/map-agent         │    │
│              │  (Next.js API Route)    │    │
│              └────────────┬────────────┘    │
│                           │                 │
│                  OpenRouter Chat API         │
│                  (Function Calling)          │
│                           │                 │
│              ┌────────────▼────────────┐    │
│              │  Tool Execution         │    │
│              │  (MapLibre GL API)      │    │
│              └─────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### How It Works

1. **User types or speaks** a natural-language command in the chat panel.
2. The message is sent to **`/api/map-agent`** (Next.js API route).
3. The API route forwards the conversation to **OpenRouter** with function-calling tool schemas.
4. OpenRouter returns a **structured tool call** (e.g., `searchPlace({ query: "Hanoi" })`).
5. The frontend **executes the tool** against the MapLibre map instance.
6. The result is shown in the chat as a **tool execution log** (for demo wow effect).

**Key principle:** The LLM never touches the map directly. It only decides _which tool to call_ with _what arguments_.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** and **npm**
- An **OpenRouter API key** ([get one here](https://openrouter.ai/keys))

### 1. Clone & Install

```bash
cd agentic-gis
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your OpenRouter key:

```
OPENROUTER_API_KEY=sk-or-your-real-api-key
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_APP_NAME=GTEL Maps Copilot
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
MAP_AGENT_CACHE_ENABLED=true
MAP_AGENT_CACHE_TTL_MS=300000
MAP_AGENT_CACHE_MAX_ENTRIES=200
```

### 3. Run

```bash
npm run dev
```

Open **http://localhost:3000/maps** in your browser.

Voice input note:

- Click the microphone button in chat input to start speaking.
- Best support: Chrome / Edge (Web Speech API).

### 4. Cache Tuning (Cost Optimization)

`/api/map-agent` includes in-memory response caching for repeated prompts:

- `MAP_AGENT_CACHE_ENABLED`: enable/disable cache (`true` by default)
- `MAP_AGENT_CACHE_TTL_MS`: cache lifetime in milliseconds (default `300000` = 5 minutes)
- `MAP_AGENT_CACHE_MAX_ENTRIES`: max number of cached responses (default `200`)

---

## 💬 Demo Commands to Try

| Command                                                            | What Happens                                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `Zoom to Hanoi`                                                    | Searches "Hanoi" → flies map to coordinates                                             |
| `Go to Ben Thanh Market`                                           | Uses Google Places Text Search → flies to location → adds marker with richer place info |
| `Route from Ben Thanh Market to Tan Son Nhat Airport by car`       | Gets Google driving directions → draws route on map                                     |
| `Route from my location to Tan Son Nhat Airport`                   | Uses current GPS location as origin → draws route                                       |
| `Walking route from Ben Thanh Market to Nguyen Hue Walking Street` | Gets Google walking directions → draws route on map                                     |
| `Find nearby coffee within 1000m`                                  | Calls Google nearby search → drops markers + draws radius buffer                        |
| `Where am I?`                                                      | Gets browser GPS → flies to user location                                               |
| `What's the map center?`                                           | Returns current lng/lat/zoom                                                            |

---

## 🧰 Available Map Tools

| Tool                                                | Description                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `searchPlace(query)`                                | Use Google Places Text Search for a place → fly there + add marker with place metadata |
| `getDirections(from, to, mode?)`                    | Get Google directions by transport mode and draw route                                 |
| `nearbySearch(keyword?, type?, location?, radius?)` | Find nearby places and draw selected radius buffer                                     |
| `getUserLocation()`                                 | Get user GPS → fly to their location                                                   |
| `getMapCenter()`                                    | Return current center coordinates and zoom                                             |

---

## 📁 Project Structure

```
agentic-gis/
├── app/
│   ├── layout.tsx              # Root layout with metadata
│   ├── page.tsx                # Redirects to /maps
│   ├── globals.css             # Global styles
│   ├── maps/
│   │   └── page.tsx            # Main map page with Copilot
│   └── api/
│       └── map-agent/
│           └── route.ts        # OpenRouter function-calling API
├── components/
│   ├── MapView.tsx             # MapLibre GL map component
│   ├── MapCopilot.tsx          # Floating chat panel
│   └── ChatMessage.tsx         # Individual message renderer
├── lib/
│   ├── openai.ts               # LLM types, system prompt, utilities
│   ├── toolSchemas.ts          # JSON schemas for all tools
│   └── mapTools.ts             # Tool implementations (MapLibre API)
├── .env.example                # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔧 Tech Stack

| Layer                | Technology                                              |
| -------------------- | ------------------------------------------------------- |
| Framework            | Next.js 14 (App Router)                                 |
| Language             | TypeScript                                              |
| Map Engine           | MapLibre GL JS                                          |
| Basemaps             | CARTO Voyager (vector), CARTO Dark Matter (satellite)   |
| Text Search / Places | Google Places Text Search + Google Places Nearby Search |
| AI                   | OpenRouter (OpenAI-compatible Function Calling)         |
| Distance             | Turf.js geodesic calculations                           |

---

## 🗺️ Future Roadmap

- [ ] **Streaming responses** — Stream LLM output token-by-token for real-time UX
- [x] **Routing & directions** — Integrate OSRM or Valhalla for turn-by-turn navigation
- [x] **POI search** — Overpass API integration for "find all hospitals near me"
- [x] **Voice input** — Speech-to-text for hands-free map control

---

## 📝 License

Internal demo — GTEL Maps Platform Team.
