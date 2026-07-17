FROM node:22.23.1-bookworm-slim AS build

WORKDIR /workspace
COPY package.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/contracts ./packages/contracts
RUN npm install --ignore-scripts --no-audit --no-fund
RUN npm run build --workspace @wms/contracts
RUN npm run build --workspace @wms/web

FROM nginxinc/nginx-unprivileged:1.28.0-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
