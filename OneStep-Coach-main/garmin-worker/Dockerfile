# Production Garmin auto-sync worker (token restore only).
# NEVER bake secrets / .env / tokens into the image.
# Playwright/Chromium is NOT required for automatic sync.

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PYTHONUNBUFFERED=1
# Explicit: worker never uses local token files
ENV GARMIN_TOKEN_DIR=/tmp/garmin-unused

USER nobody

CMD ["python", "-m", "app.worker"]
