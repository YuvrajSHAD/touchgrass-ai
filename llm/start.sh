#!/bin/bash
set -e

echo "======================================"
echo " TouchGrass AI - Gemma 3 1B"
echo "======================================"

if [ ! -f "$MODEL_PATH" ]; then
    echo "Gemma model not found."
    echo "Downloading Gemma 3 1B GGUF..."

    curl -L \
        --fail \
        --retry 3 \
        --retry-delay 5 \
        "$MODEL_URL" \
        -o "$MODEL_PATH"

    echo "Gemma download complete."
else
    echo "Gemma model already exists."
fi

echo "Starting llama.cpp..."
echo "Model: $MODEL_PATH"
echo "Port: 8080"

exec /app/llama.cpp/build/bin/llama-server \
    --model "$MODEL_PATH" \
    --host 0.0.0.0 \
    --port 8080 \
    --ctx-size 4096 \
    --n-predict 256