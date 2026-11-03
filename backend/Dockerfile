# EdunexusAI Backend
# Build from the REPOSITORY ROOT (the API imports the repo-level shared/ folder):
#   docker build -f backend/Dockerfile -t edunexusai-api:<sha> .
# Multi-stage build: install dependencies, generate Prisma client, run.
FROM node:22-alpine AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS prisma
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
RUN npx prisma generate

FROM node:22-alpine
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prisma /app/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/prisma ./prisma
COPY backend/src ./src
# Imported as ../../../../shared from src/modules/*/ — i.e. /shared in the image.
COPY shared /shared

# Branding uploads persist in a volume
RUN mkdir -p /app/storage/branding && chown -R node:node /app/storage
VOLUME ["/app/storage/branding"]

USER node
EXPOSE 5001

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5001/api/v1/health || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "src/server.js"]
