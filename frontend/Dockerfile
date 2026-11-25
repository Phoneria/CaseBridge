FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The app currently has no static assets, so a fresh checkout may not have a
# public directory. Keep the runtime copy step valid in that case.
RUN mkdir -p public
# NEXT_PUBLIC_* vars must be present at build time - they're inlined
# into the client bundle, not read at runtime. Pass via --build-arg.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_RELEASE_COMMIT=development
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_RELEASE_COMMIT=$NEXT_PUBLIC_RELEASE_COMMIT
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Runtime assets must be readable by node regardless of source directory modes
# or cached COPY metadata. The root filesystem remains read-only in production.
RUN chmod -R a+rX /app/public /app/.next

EXPOSE 3000
USER node
CMD ["node", "node_modules/next/dist/bin/next", "start"]
