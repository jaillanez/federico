# web-build: rebuilds the static site on demand (webhook) into a volume served by Caddy.
FROM node:22-alpine
ENV ASTRO_TELEMETRY_DISABLED=1 NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --include=dev
COPY . .
RUN mkdir -p /srv/site && chown -R node:node /srv/site /app
USER node
EXPOSE 4322
# BUILD_ON_START=1: the first build runs as soon as the container (and the API) are up.
CMD ["node", "scripts/build-server.mjs"]
