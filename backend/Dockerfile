# ============================================================
# Image Docker production — GMAO ARGOS backend
# ============================================================

# ---- Stage 1 : build ----
FROM node:20-alpine AS builder
WORKDIR /app

# Dépendances système (bcrypt natif)
RUN apk add --no-cache python3 make g++ openssl

# Install des dépendances
COPY package.json package-lock.json* ./
RUN npm ci

# Copie sources et build TypeScript
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts

RUN npx prisma generate
RUN npm run build

# ---- Stage 2 : runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl tini && \
    addgroup -S app && adduser -S app -G app

ENV NODE_ENV=production
ENV PORT=4000

# Dépendances de prod uniquement
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Artéfacts compilés
COPY --from=builder /app/dist        ./dist
COPY --from=builder /app/prisma      ./prisma
COPY --from=builder /app/scripts     ./scripts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Le frontend statique sera monté en volume ou copié au déploiement
RUN mkdir -p /app/uploads && chown -R app:app /app

USER app
EXPOSE 4000

# Tini pour gérer les signaux + migrations Prisma au boot
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
