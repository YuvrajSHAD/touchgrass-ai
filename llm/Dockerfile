FROM ubuntu:24.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN git clone --depth 1 https://github.com/ggml-org/llama.cpp.git && \
    cmake -S llama.cpp -B llama.cpp/build \
      -DGGML_NATIVE=OFF \
      -DGGML_OPENMP=OFF && \
    cmake --build llama.cpp/build --config Release -j2 --target llama-server

RUN mkdir -p /models

ENV MODEL_URL=https://huggingface.co/lm-kit/gemma-3-1b-instruct-gguf/resolve/main/gemma-3-1b-it-Q4_K_M.gguf
ENV MODEL_PATH=/models/gemma-3-1b-it-Q4_K_M.gguf

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8080

CMD ["/app/start.sh"]