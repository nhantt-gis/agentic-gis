# =============================================================================
# Stage 1: base — shared Alpine + Node setup
# =============================================================================
FROM node:20-alpine AS base

# Install libc compat for native modules on Alpine
RUN apk add --no-cache libc6-compat

WORKDIR /app

# =============================================================================
# Stage 2: deps — install ALL dependencies (cached separately)
# =============================================================================
FROM base AS deps

# Copy only manifests first to leverage Docker layer cache
COPY package.json package-lock.json* ./

# Install all deps (prod + dev) needed for build
RUN npm ci --frozen-lockfile

# =============================================================================
# Stage 3: builder — compile the Next.js application
# =============================================================================
FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# =============================================================================
# Stage 4: development — hot-reload dev server
# =============================================================================
FROM base AS development

WORKDIR /app

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

# =============================================================================
# Stage 5: production — minimal standalone image
# =============================================================================
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy only the standalone build output and required static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static   ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output ships its own server.js
CMD ["node", "server.js"]
