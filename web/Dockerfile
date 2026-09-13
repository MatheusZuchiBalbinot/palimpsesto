# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

# --- dev: Vite dev server with hot reload, code mounted via bind mount ---
FROM base AS dev
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# --- build: static assets for production ---
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- prod: nginx serving the assets ---
# fholzer/nginx-brotli, not the official nginx:1.27-alpine this replaced —
# same Alpine base, but with the ngx_brotli module compiled in. gzip alone
# (still configured below) leaves 15-20% on the table on the exact assets
# that matter most here (the JS/CSS bundle), for zero cost once the image
# has it — see VITE_BUILD_PLAN.md. Pinned by digest: this image doesn't
# publish version-numbered tags the way the official one does, so a digest
# is the only reproducible way to pin it.
FROM fholzer/nginx-brotli@sha256:59e5a7f79297342d5a1caff6bf70d0ec68bb74318db1a1fa1106225b114e75d1 AS prod
COPY --from=build /app/dist /usr/share/nginx/html
# .template, not a plain .conf: unlike the official nginx image, this one
# has no /docker-entrypoint.d/ scripts to run envsubst automatically — our
# own docker-entrypoint.sh (below) does that one step itself instead, so
# API_PROXY_TARGET substitution keeps working the same way it did before.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
ENV API_PROXY_TARGET=http://server:8080
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
