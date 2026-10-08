#!/bin/sh
set -eu

if [ ! -f "${MODEL_PATH}" ]; then
  echo "ERROR: ${MODEL_PATH} not found."
  echo "Place a compatible Gemma GGUF model at llm/models/model.gguf."
  exit 1
fi

exec /app/llama-server \
  -m "${MODEL_PATH}" \
  --host 0.0.0.0 \
  --port "${PORT:-8080}" \
  -c 2048
