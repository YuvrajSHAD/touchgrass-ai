# Elsewhere — TouchGrass

> **Don't remind me. Give me a reason.**

Elsewhere is a lightweight, installable Progressive Web App (PWA) that turns a person's available time, interests, and nearby friends into one simple outdoor side quest.

Instead of sending reminders to disconnect, Elsewhere gives people a reason to do it. The experience is intentionally small: get a suggestion, close the app, and go do something in the real world.

**Live Demo:** https://sidequest-touchgrass.onrender.com/   
**AI Space:** https://huggingface.co/spaces/create-your-own

---

## Table of Contents

- [What Is Elsewhere?](#what-is-elsewhere)
- [Core Features](#core-features)
- [How It Works](#how-it-works)
- [AI Inference](#ai-inference)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Run Locally](#run-locally)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints)
- [Privacy by Design](#privacy-by-design)
- [Deployment](#deployment)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [License](#license)

## What Is Elsewhere?

Most digital products try to keep people engaged for as long as possible. Elsewhere takes the opposite approach.

It is designed to help people spend less time deciding what to do and more time actually doing it. Rather than providing an endless feed of activities, it offers one contextual suggestion based on what a person enjoys, how much time they have, and whether a friend is nearby.

The principle is simple:

**Don't remind me to go outside. Give me a reason worth going out for.**

## Core Features

### One small side quest

Elsewhere generates a single, short outdoor suggestion rather than a list of activities. Suggestions are intended to be actionable, personal, and appropriate for the time available.

### Interest-based suggestions

Users can select interests that help shape their suggestions. The goal is to turn something they already enjoy into a reason to explore their surroundings.

### Time-aware activities

Users choose how much time they have. Suggestions can be tailored to short breaks or longer windows of free time.

### Nearby-friend awareness

Users can create or join a small circle and share their availability. When a friend is nearby and available, Elsewhere can incorporate that context into a suggestion.

### Installable PWA

The web app can be installed on supported devices, providing an app-like experience without requiring a separate native application.

### Open-weight AI

Elsewhere supports Qwen3 1.7B through a Hugging Face ZeroGPU Space, alongside a local llama.cpp integration for compatible OpenAI-style inference endpoints. A built-in fallback keeps suggestion generation available when model inference cannot be used.

### Deliberately minimal

Elsewhere is not built around engagement loops. There are no activity feeds, streaks, or push notifications.

## How It Works

The application combines a small web interface, a Node.js backend, optional AI inference, and lightweight in-memory state.

1. **Choose a time window.** The user selects how much time they have available.
2. **Provide personal context.** Interests and nearby-friend availability help shape the suggestion.
3. **Build a prompt.** The backend formats that context into instructions for generating one outdoor side quest.
4. **Generate a suggestion.** The backend attempts Hugging Face inference first when configured, then tries the local OpenAI-compatible model if configured.
5. **Use a fallback if needed.** If neither model returns a usable response, the backend generates a simple template-based suggestion.

The objective is not to maximize time spent in the app. It is to make the next real-world action easier.

## AI Inference

Elsewhere supports two model-inference paths.

### Hugging Face ZeroGPU — Qwen3 1.7B

The public Space runs `Qwen/Qwen3-1.7B` and exposes a Gradio API endpoint for generating suggestions.

When `HF_SPACE_URL` is configured, the backend submits the prompt to the Space, retrieves the completed response, and returns the suggestion to the frontend.

- Model: [Qwen3 1.7B](https://huggingface.co/Qwen/Qwen3-1.7B)
- Inference Space: [Elsewhere — Qwen3](https://huggingface.co/spaces/zoroxR/elsewhere-qwen)
- Hardware: Hugging Face ZeroGPU

### Local inference — llama.cpp

For local development, Elsewhere can use a running llama.cpp server that exposes an OpenAI-compatible chat-completions endpoint.

This provides an alternative to cloud inference and allows the model to run on the developer's own machine.

See [`llm/README.md`](llm/README.md) for local model setup.

### Provider priority and fallback

The backend follows this order:

1. Hugging Face, when `HF_SPACE_URL` is configured and returns a usable suggestion.
2. Local llama.cpp, when `LLM_BASE_URL` is configured and returns a usable suggestion.
3. A built-in template suggestion if neither inference path succeeds.

A configured provider is not necessarily a successfully operating provider. Runtime errors are logged by the backend, and the fallback keeps the basic experience usable.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Application format | Progressive Web App (PWA) |
| Backend | Node.js, Express |
| AI model | Qwen3 1.7B |
| Cloud inference | Hugging Face Spaces, Gradio, ZeroGPU |
| Local inference | llama.cpp, OpenAI-compatible API |
| Deployment | Render |
| Group and presence state | In-memory JavaScript data structures |

## Project Structure

```text
touchgrass-ai/
├── hf-space/
│   ├── app.py
│   ├── requirements.txt
│   └── README.md
├── llm/
│   └── README.md
├── web/
│   ├── public/
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
├── render.yaml
├── README.md
└── LICENSE
```

The `hf-space/` directory contains the Hugging Face inference application. The `llm/` directory documents the local model setup, while `web/` contains the web frontend and Express backend.

## Run Locally

### Prerequisites

- Node.js 20 or later
- npm
- A Hugging Face Space URL, a local OpenAI-compatible model endpoint, or neither if you want to test the fallback
- A Hugging Face access token if your Space or account configuration requires authentication

### 1. Clone the repository

```bash
git clone https://github.com/YuvrajSHAD/touchgrass-ai.git
cd touchgrass-ai
```

### 2. Install the web dependencies

```bash
cd web
npm install
```

### 3. Configure environment variables

Create a `.env` file in the `web/` directory using `.env.example` as a reference.

For Hugging Face inference:

```env
HF_SPACE_URL=https://zoroxr-elsewhere-qwen.hf.space
HF_API_KEY=your_huggingface_token_here
```

Replace the example token with your own token. Keep `.env` private and out of version control.

### 4. Start the backend

```bash
npm start
```

The server should start at:

```text
http://localhost:3000
```

Open that address in your browser to use Elsewhere.

### 5. Optional: Configure local llama.cpp

If you also run a local llama.cpp server, configure its OpenAI-compatible endpoint:

```env
LLM_BASE_URL=http://127.0.0.1:8080/v1
LLM_MODEL=ggml-org/Qwen3-1.7B-GGUF:Q4_K_M
LLM_TIMEOUT_MS=15000
```

The URL and model name must match your actual llama.cpp configuration.

When both providers are configured, Hugging Face is attempted first and local inference is used as a fallback.

## Configuration

| Variable | Purpose |
|---|---|
| `PORT` | Port for the Express server. Defaults to `3000`. |
| `HF_SPACE_URL` | Base URL of the Hugging Face Gradio Space. |
| `HF_API_KEY` | Optional Bearer token used for Hugging Face requests. |
| `HF_TIMEOUT_MS` | Timeout for the Hugging Face request flow. Defaults to `30000` ms. |
| `LLM_BASE_URL` | Base URL of the local OpenAI-compatible inference server. |
| `LLM_API_KEY` | Optional API key for the local inference endpoint. |
| `LLM_MODEL` | Model identifier sent to the local inference server. |
| `LLM_TIMEOUT_MS` | Timeout for local inference. Defaults to `15000` ms. |

Only configure the providers you intend to use. Do not commit real API tokens, credentials, or private environment files.

## API Endpoints

The Express backend exposes endpoints used by the web application.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Reports service health, configured inference provider, and group count. |
| `GET` | `/api/config` | Reports whether inference is configured and which provider has priority. |
| `POST` | `/api/suggestion` | Generates a suggestion from interests, available time, and nearby-friend context. |
| `POST` | `/api/groups` | Creates a group and returns its code and user ID. |
| `POST` | `/api/groups/join` | Joins an existing group. |
| `GET` | `/api/groups/:code/members` | Returns the group's member information. |
| `POST` | `/api/location` | Updates a member's location and interests. |
| `POST` | `/api/presence` | Updates availability and location, then identifies nearby available members. |

For example, check the local service configuration at:

```text
http://localhost:3000/api/health
```

The health endpoint confirms configuration; it does not independently prove that an inference request succeeded.

## Privacy by Design

Elsewhere aims to minimize unnecessary data collection and social pressure.

- **No accounts required by the current backend design.**
- **Rounded coordinates:** the backend rounds coordinates before storing them.
- **Limited presence lifetime:** presence is treated as stale after ten minutes.
- **No exact-coordinate display:** the group member response does not expose members' stored latitude and longitude.
- **No push notifications:** users are not repeatedly prompted to return.
- **In-memory group state:** group and presence information is held in server memory rather than a persistent database.
- **No activity feed or streak system:** the app is focused on the next activity, not prolonged engagement.

### AI and data handling

The selected inference provider affects where prompts are processed.

- With Hugging Face configured, suggestion prompts are sent to the configured Space.
- With local llama.cpp, prompts are sent to the configured local inference endpoint.
- If neither provider is usable, a template suggestion is generated by the backend.

Avoid putting sensitive personal information in interests or prompts. The privacy characteristics of the inference provider, hosting platform, and deployment must also be considered when operating a public instance.

## Deployment

### Render

The repository includes `render.yaml` for the Render deployment configuration.

For a deployment using Hugging Face inference, configure these environment variables in the Render service:

```text
HF_SPACE_URL
HF_API_KEY
```

Store the real token in Render's environment settings, not in the repository. Do not configure a laptop-only `localhost` model URL on Render; it would refer to the Render environment rather than your computer.

After deployment, check `/api/health` and generate a suggestion to verify that inference works in the deployed environment.

### Hugging Face Space

The inference application lives in `hf-space/`. It loads Qwen3 1.7B, uses the Spaces GPU decorator for generation, and exposes a Gradio interface and API endpoint.

The web backend and the inference Space are separate services: successful Space startup does not by itself guarantee that the deployed web backend is correctly configured to call it.

## Limitations

- Group and presence state is held in memory and can be lost when the server restarts.
- Presence and nearby-friend matching depend on users sharing location and availability.
- The Hugging Face inference path depends on Space availability, hardware allocation, quotas, and request latency.
- Local inference requires a compatible model server to be running.
- Template fallback suggestions are less personalized than model-generated responses.
- Location rounding reduces precision but does not make location information inherently risk-free.

## Contributing

Contributions that keep Elsewhere small, useful, and privacy-conscious are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make focused changes.
4. Test the application locally.
5. Open a pull request describing the change and how it was tested.

Please avoid adding engagement mechanics that conflict with the project's core principle.

## License

See [`LICENSE`](LICENSE) for the license governing this repository.

---

*Elsewhere is built around a simple idea: the best outcome is that someone closes the app and goes outside.*
