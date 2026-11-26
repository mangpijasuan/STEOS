# Production image for STEOS (used by Coolify or any Docker host).
#
# The image keeps the full node_modules, including `tsx`, so the same image can run the web app, the order worker and the
# one-off database commands:
#   web app          npm start                  (the default)
#   order worker     npm run worker:orders
#   migrations       npm run db:migrate         (needs DATABASE_OWNER_URL)
#   Zogam import     npm run db:seed:zogam
# Secrets and connection strings are supplied as environment variables at run time, never baked into the image.

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/live').then((r) => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"
CMD ["npm", "start"]
