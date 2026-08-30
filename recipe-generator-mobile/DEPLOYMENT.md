# Deployment

Expo web build served via nginx in Docker, exposed to the internet via Cloudflare Tunnel from a home VM.

## Prerequisites

- Docker + Docker Compose on the VM
- Cloudflare Tunnel token (create at dash.cloudflare.com → Zero Trust → Tunnels)
- Backend API reachable from the VM (see `recipe-generator/` for backend deployment)

## 1. Update production config

In `src/constants/index.ts`, set the production API URL:

```ts
export const API_BASE_URL = __DEV__
  ? 'http://localhost:8080/api/v1'
  : 'https://api.yourdomain.com/api/v1';   // ← your backend tunnel URL
```

Also update `KEYCLOAK_CONFIG` if your Keycloak instance has a fixed URL already.

## 2. Add a web redirect URI in Keycloak

The native scheme `com.recipegenerator://oauth/callback` does not work in a browser.

In Keycloak → `recipe-generator` realm → `frontend` client → Valid Redirect URIs, add:

```
https://app.yourdomain.com/oauth/callback
```

Then update `redirectUri` in `src/constants/index.ts` for the web platform (use `Platform.OS` guard if you need both native and web to coexist).

## 3. Build

```bash
cd recipe-generator-mobile
npm ci
npx expo export --platform web   # outputs to dist/
```

The `dist/` folder contains a fully static SPA.

## 4. Docker files

`Dockerfile` (in this directory):

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx expo export --platform web

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`nginx.conf` (in this directory):

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 5. docker-compose on the VM

Place this at `~/recipe-generator/docker-compose.yml` on the VM alongside the synced `frontend/` folder:

```yaml
services:
  frontend:
    build: ./frontend/recipe-generator-mobile
    restart: unless-stopped
    ports:
      - "3000:80"

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
```

Create a `.env` file next to it:

```
CLOUDFLARE_TUNNEL_TOKEN=<your token here>
```

## 6. Cloudflare Tunnel routing

In the Tunnel config (Cloudflare dashboard → Zero Trust → Tunnels → your tunnel → Public Hostnames):

| Public hostname | Service |
|---|---|
| `app.yourdomain.com` | `http://frontend:3000` |
| `api.yourdomain.com` | `http://backend:8080` (if backend is in the same compose) |

## 7. Deploy

```bash
# On the VM
cd ~/recipe-generator
docker compose up -d --build
```

## Sync from dev machine

The rsync command in the workspace already excludes `node_modules/`, `dist/`, and `build/` — the Docker build runs `npm ci` and `expo export` inside the container so nothing pre-built needs to be transferred.

```bash
rsync -az --info=progress2 \
  --exclude='node_modules/' --exclude='.git/' --exclude='dist/' --exclude='build/' \
  recipe-generator-frontend/ ilija@192.168.10.163:/home/ilija/recipe-generator/frontend/
```
