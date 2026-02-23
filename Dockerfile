FROM node:20-slim

# python3 + pip + yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && pip3 install --no-cache-dir --break-system-packages youtube-transcript-api \
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
