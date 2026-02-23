ROLE

You are a Senior AI Engineer + Senior GIS Engineer + Frontend Engineer.
Your task is to generate a complete demo project for an Agentic GIS Map Copilot for a maps platform similar to GTEL Maps.
This is a realistic product demo, not a toy script.
The demo must allow users to control a web map using natural language.

🎯 DEMO GOAL

Build a Map Copilot that works inside a /maps web page.
Users can type natural language such as:
"Zoom to Hanoi"
"Go to Ben Thanh Market"
The AI must understand the request and control the map automatically.

🧭 HIGH LEVEL ARCHITECTURE
 Next.js frontend (MapLibre)
          ↓
   Map Copilot Chat UI
          ↓
 Next.js API route (/api/map-agent)
          ↓
 OpenAI Function Calling
          ↓
 Tool execution in frontend (MapLibre API)

Important:
The LLM does NOT control the map directly.
It chooses which Map Tool to call.

🧱 TECH STACK (MANDATORY)

- Frontend:
  + Next.js with TypeScript
  + Tailwind CSS for styling
  + React Map GL for web map (MapLibre GL JS v5.x)

- Backend:
  + Next.js API routes
  + OpenAI Chat API with Function Calling
  + No Python in this demo.

- Extras:
  + Error handling and edge cases
  + Logging of user messages and tool calls in the UI
  + Caching when calling the APIs — use in-memory 

🧰 MAP TOOLS TO IMPLEMENT

Design a Tool Registry that exposes map capabilities to the LLM.
Implement these tools:
- Navigation tools
  + searchPlace(query) → uses Google text search
  + getDirections(from, to) → uses Google directions

- Map utilities
  + getUserLocation()
  + getMapCenter()

Each tool must be implemented in TypeScript and call MapLibre API.

🤖 LLM FUNCTION CALLING

You must implement OpenAI function calling.
The system prompt must instruct the model:
Convert user request → tool call
Choose the best tool
Return JSON function call only
Never return explanations
Define JSON schemas for all tools.

🖥️ UI REQUIREMENTS

Create a /maps page that contains:
Fullscreen MapLibre map
Floating chat panel (Map Copilot)
Chat history
Loading state when AI is thinking
Show tool execution logs in UI (for demo wow effect)

🧩 PROJECT STRUCTURE
 ├── app/maps/page.tsx
 ├── components/
 │     ├── MapView.tsx
 │     ├── MapCopilot.tsx
 │     ├── ChatMessage.tsx
 ├── lib/
 │     ├── mapTools.ts
 │     ├── openai.ts
 │     ├── toolSchemas.ts
 ├── app/api/map-agent/route.ts
 ├── package.json
 ├── README.md

📜 CODE REQUIREMENTS

Generate FULL WORKING CODE for all files.
The code must:
be clean and well structured
use TypeScript
include comments
include environment variables for API key
include error handling

📘 README REQUIREMENTS

Include:
How to install and run the demo
How to get OpenAI API key
Demo commands to try
Architecture explanation
Future roadmap section

⭐ IMPORTANT

This demo will be used to present an AI-powered Maps platform internally.
Code quality must be production-like.
Generate the full project now.
