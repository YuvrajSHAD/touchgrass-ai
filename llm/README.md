# SideQuest local LLM

The project expects a local llama.cpp-compatible server exposing:

`POST /v1/chat/completions`

The default example uses a small Qwen3 GGUF model, but any compatible open-weight instruct model can be used.

## Start llama.cpp

Use the llama.cpp command appropriate for your installed version and model.

The web app expects:

```text
http://localhost:8080/v1
```

and sends a short prompt containing:

- available time
- saved interests
- whether a friend is currently nearby

The model returns exactly one outdoor side quest.

No weather, push notification, or cloud inference is involved.

If the LLM endpoint is unavailable, the web app falls back to a local deterministic suggestion.
