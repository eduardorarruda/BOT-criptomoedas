# Tela do ZenTrade: arquivos estáticos do Vite servidos pelo nginx (sem root), com
# proxy de /api (REST e WebSocket) para o serviço "api" do docker-compose.
# Funciona com o builder clássico e com o BuildKit. Build, da raiz do repositório: docker build -f infra/docker/web.Dockerfile -t zentrade-web .
ARG NODE_IMAGEM=node:24-alpine
ARG NGINX_IMAGEM=nginxinc/nginx-unprivileged:1.29-alpine

FROM ${NODE_IMAGEM} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS construir
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter "@zentrade/web..." build

FROM ${NGINX_IMAGEM} AS execucao
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=construir /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -q -O /dev/null http://127.0.0.1:8080/saude-web || exit 1
