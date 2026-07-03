# Always-on DBS → TreeCo sync worker.
# Base image already contains Chromium + all system deps for Playwright 1.60.0,
# so there is no browser download step.
FROM mcr.microsoft.com/playwright/python:v1.60.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY dbs_to_treeco.py .

# Headless, and poll every 10 minutes by default. Override with fly secrets/env.
ENV DBS_HEADLESS=1 \
    DBS_POLL_SECONDS=600

CMD ["python", "-u", "dbs_to_treeco.py"]
