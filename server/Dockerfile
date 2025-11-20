# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# install deps
COPY package*.json ./
RUN npm install

# Copy config + drizzle files
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY scripts ./scripts

# Copy source code including schema
COPY src ./src

# Build
RUN npm run build


# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Copy for migrations
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src

CMD ["node", "dist/server.js"]
