# Elsewhere — TouchGrass

> Your screen ends here.

SideQuest is a tiny PWA that gives you one simple reason to leave the screen.

It keeps two useful pieces of the original TouchGrass idea:

- **Friend proximity:** a small private circle can show which friends are currently outside and nearby.
- **Interests:** users save a few things they actually enjoy.
- **Local open-weight AI:** a local llama.cpp/OpenAI-compatible model turns those inputs into one short outdoor side quest.

It deliberately does **not** use weather, push notifications, accounts, feeds, streaks, or a cloud AI dependency.

## Why

The goal is not to remind someone to go outside.

It is:

> **Don't remind me. Give me a reason.**

The screen is intentionally the shortest part of the experience.

## Run locally

Requirements:

- Node.js 20+
- llama.cpp running locally with an OpenAI-compatible `/v1/chat/completions` endpoint
- a compatible GGUF model

### Web app

```bash
cd web
npm install
cp .env.example .env
npm run dev
```

If the local LLM is unavailable, the app uses a deterministic fallback, so the PWA still works.

### Local model

See `llm/README.md`.

## Privacy

- Friend proximity is only checked when location is requested.
- Coordinates are rounded before being stored by the server.
- Presence expires after 10 minutes.
- Exact friend coordinates are never displayed.
- There are no push notifications.
- There is no weather API.
- There is no external AI API required.

## Challenge fit

The core experience is powered by an open-weight model running locally. A user can disconnect from the internet after loading the PWA and still generate side quests as long as the local LLM endpoint is available.

The project is intentionally small: the best outcome is that the user closes the app and goes outside.
