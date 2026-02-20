FROM node:20-slim

# System dependencies: yt-dlp + python3 (for whisper) + ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Install whisper in a virtual environment
RUN python3 -m venv /opt/whisper-env \
    && /opt/whisper-env/bin/pip install --no-cache-dir openai-whisper
ENV PATH="/opt/whisper-env/bin:$PATH"

WORKDIR /app

# Install Node dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm install typescript @types/express @types/node --save-dev \
    && npx tsc \
    && npm prune --omit=dev

# Copy frontend
COPY public/ ./public/

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/index.js"]
