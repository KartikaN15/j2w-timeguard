# ─── J2W Timeguard frontend (Vite React SPA → nginx) ─────────────────────────

# Stage 1: build static assets
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json ./
COPY package-lock.json* ./
RUN npm install

COPY . .

# VITE_API_URL is baked in at build time. Default empty = same-origin
# (nginx proxies /api to the backend). Override with --build-arg if you host
# the API on a different domain.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: serve with nginx
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
