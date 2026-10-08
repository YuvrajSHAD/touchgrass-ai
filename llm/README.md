# TouchGrass LLM service

This service is deliberately separate from the web app.

## What is what?

- **Gemma 3 1B GGUF** = the open-weight AI model.
- **llama.cpp** = open-source inference engine/server.
- **Render** = hosting infrastructure.

The web service sends prompts to this service using an OpenAI-compatible `/v1/chat/completions` endpoint.

## Model file

Do not commit model weights.

Create:

```text
llm/models/model.gguf
```

with a compatible Gemma GGUF file obtained from a model provider under its applicable license.

If the model provider requires accepting a license or authentication, perform that step yourself and download the file locally.

Then build the container.

## Fallback

If the LLM service is unavailable, the web application automatically uses deterministic templates. The demo therefore does not depend on an LLM being available.
