# -- Stage 1: build ------------------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /app/backend

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc g++ \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip --quiet

# Install CPU-only torch first so sentence-transformers doesn't pull CUDA
RUN pip install --prefix=/install --no-cache-dir \
    torch==2.2.2 \
    --index-url https://download.pytorch.org/whl/cpu

# Strip everything from torch that isn't needed at runtime:
# test suite, C++ headers, share data, cabal files, pycache
RUN find /install -path "*/torch/test*"    -delete 2>/dev/null || true && \
    find /install -path "*/torch/include*" -delete 2>/dev/null || true && \
    find /install -path "*/torch/share*"   -delete 2>/dev/null || true && \
    find /install -path "*/torch/bin*"     -delete 2>/dev/null || true && \
    find /install -name "__pycache__"   -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /install -name "*.pyc"                    -delete 2>/dev/null || true && \
    find /install -name "*.pyo"                    -delete 2>/dev/null || true

COPY requirements.txt .
RUN pip install --prefix=/install --no-cache-dir -r requirements.txt

# Strip pycache from everything again after full install
RUN find /install -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /install -name "*.pyc" -delete 2>/dev/null || true && \
    find /install -name "*.pyo" -delete 2>/dev/null || true

# -- Stage 2: lean runtime -----------------------------------------------------
FROM python:3.11-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY --from=builder /install /usr/local
COPY . .

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=4 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
