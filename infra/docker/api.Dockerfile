# API do ZenTrade (REST, WebSocket, webhooks do n8n). A mesma imagem roda as
# migrações (serviço "migrar" do docker-compose) e o comando criar-usuario.
# Funciona com o builder clássico e com o BuildKit. Build, da raiz do repositório: docker build -f infra/docker/api.Dockerfile -t zentrade-api .
ARG NODE_IMAGEM=node:24-alpine

FROM ${NODE_IMAGEM} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS construir
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter "@zentrade/api..." build
RUN pnpm --filter @zentrade/api deploy --prod /saida

FROM ${NODE_IMAGEM} AS execucao
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORTA=8080
WORKDIR /app
COPY --from=construir --chown=node:node /saida ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/v1/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/servidor.js"]
