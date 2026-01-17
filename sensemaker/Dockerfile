# Multi-stage Dockerfile for Sensemaker
# Express API + Vite React Admin frontend

# Stage 1: Base with pnpm
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Stage 2: Dependencies
FROM base AS deps
COPY pnpm-lock.yaml package.json ./
COPY prisma ./prisma/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Stage 3: Build
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN pnpm db:generate

# Build server (TypeScript -> dist/)
RUN pnpm build:server

# Build client (Vite -> public/)
RUN pnpm build:client

# Stage 4: Production runner
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat dumb-init
ENV NODE_ENV=production
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy everything from build (includes node_modules with prisma client)
COPY --from=build --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=appuser:nodejs /app/dist ./dist
COPY --from=build --chown=appuser:nodejs /app/public ./public
COPY --from=build --chown=appuser:nodejs /app/prisma ./prisma
COPY --from=build --chown=appuser:nodejs /app/package.json ./

USER appuser

ENV PORT=8080
EXPOSE 8080

# Use dumb-init for proper signal handling
CMD ["dumb-init", "node", "dist/index.js"]
