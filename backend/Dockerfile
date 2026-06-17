# ─── J2W Timeguard backend (Express + MongoDB) ───────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json ./
COPY package-lock.json* ./
RUN npm install --omit=dev

# Copy source
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

# Runs TypeScript directly via tsx (no separate build step needed)
CMD ["npm", "run", "start"]
