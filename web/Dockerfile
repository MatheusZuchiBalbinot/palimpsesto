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
FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
# .template: the base image's own docker-entrypoint runs envsubst on every
# file here before nginx starts, writing the result to conf.d/ — lets
# API_PROXY_TARGET be overridden per-deployment (docker run -e) without
# rebuilding the image.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_PROXY_TARGET=http://server:8080
EXPOSE 80
