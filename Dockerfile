FROM node:20-slim

# yt-dlp만 설치 (whisper는 로컬 전용 — 서버에서는 자막 없으면 스킵)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

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
