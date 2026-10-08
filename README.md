# 🌱 TouchGrass AI

An AI-powered outdoor companion that turns real-world context into reasons to leave the screen and go outside.

TouchGrass uses **open-weight Gemma 3 1B** through **llama.cpp** to create personalized outdoor suggestions based on:

- 🌦️ Local weather
- 🧑‍🤝‍🧑 Nearby friends
- 🏃 User interests
- 📍 Approximate location

## How It Works

```text
User
 ↓
TouchGrass PWA
 ↓
Weather + Interests + Nearby Friends
 ↓
Node.js / Express
 ↓
llama.cpp
 ↓
Gemma 3 1B
 ↓
Personalized outdoor activity
