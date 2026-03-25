# -- Stage 1: build ------------------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /app/backend

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc g++ \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip --quiet

COPY backend/requirements.txt .
RUN pip install --prefix=/install --no-cache-dir -r requirements.txt

RUN find /install -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /install -name "*.pyc" -delete 2>/dev/null || true

# -- Stage 2: lean runtime -----------------------------------------------------
# -- Stage 2: lean runtime -----------------------------------------------------
FROM python:3.11-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY --from=builder /install /usr/local  
COPY backend/ .
COPY data/ ../data/

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
