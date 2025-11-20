# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy configs and scripts
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY scripts ./scripts

# Copy source code
COPY src ./src

# If you have drizzle migrations (usually in .drizzle/)
# Comment out if you don't have this directory
COPY .drizzle ./.drizzle

# Build
RUN npm run build


# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy runtime dependencies and build output
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Copy scripts + drizzle config for migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/.drizzle ./.drizzle

CMD ["node", "dist/server.js"]
