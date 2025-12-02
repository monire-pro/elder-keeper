# ✅ UPDATED: Use Python 3.11 (3.9 is deprecated/broken for some libs)
FROM python:3.11-slim

# 1. Install System Dependencies (FFmpeg is required for Audio processing)
# We also install 'flac' which SpeechRecognition sometimes needs
RUN apt-get update && apt-get install -y \
    ffmpeg \
    flac \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 2. Set working directory
WORKDIR /app

# 3. Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Copy the rest of the application
COPY . .

# 5. Expose Port 8080 (Required for Render/Cloud Run)
EXPOSE 8080

# 6. Run the application
# Note: Render ignores the EXPOSE instruction, but needs the PORT env var.
# We bind to 0.0.0.0 to ensure external access.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]