FROM node:22.23.1-bookworm-slim AS build

WORKDIR /workspace
COPY package.json tsconfig.base.json ./
COPY frontend/web ./frontend/web
COPY shared/contracts ./shared/contracts
RUN npm install --ignore-scripts --no-audit --no-fund
RUN npm run build --workspace @wms/contracts
RUN npm run build --workspace @wms/web

FROM nginxinc/nginx-unprivileged:1.28.0-alpine

COPY frontend/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/frontend/web/dist /usr/share/nginx/html
EXPOSE 8080
