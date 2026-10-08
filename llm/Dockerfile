FROM ghcr.io/ggerganov/llama.cpp:server

WORKDIR /app
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Put your GGUF model in llm/models/model.gguf before building,
# or mount/provide it through your deployment strategy.
COPY models /models

ENV MODEL_PATH=/models/model.gguf
ENV PORT=8080

EXPOSE 8080
ENTRYPOINT ["/app/start.sh"]
