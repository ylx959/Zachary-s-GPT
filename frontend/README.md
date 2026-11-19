# ZacharyGPT frontend

Next.js 16 + React 19 + TypeScript + Tailwind CSS 4. Talks to the FastAPI backend in `../backend`.

```bash
npm install
cp .env.example .env.local   # optional: NEXT_PUBLIC_API_URL, defaults to http://localhost:8080
npm run dev                  # http://localhost:3000 (start the backend first)
npm test                     # vitest
npm run typecheck && npm run lint
```

## Structure

```text
app/                      layout, page, global styles and design tokens (globals.css)
features/chat/
  use-chat.ts             the chat module: state + send / stop / upload / openConversation / newChat
  use-dictation.ts        browser speech-to-text for the mic button
  use-sidebar.ts          resizable / collapsible sidebar (drag, keyboard, ⌘B, persisted)
  chat-screen.tsx         composes the screen from useChat and the components below
  components/             presentational only: sidebar, header, message list, empty state, composer
tests/                    vitest tests, mirroring the source paths (setup.ts: shared setup)
lib/
  api.ts                  ChatApi interface + httpChatApi adapter (fetch to the backend)
  sse.ts                  incremental parser for the /api/chat/stream events
  models.ts, format.ts    model list, date and avatar helpers
```

Components never call the backend; they render what `useChat` returns. Tests drive `useChat`
through an in-memory `ChatApi`, so they need no server.
