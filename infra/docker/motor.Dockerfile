# Motor do ZenTrade (robôs, risco, ordens). Não abre porta.
# Funciona com o builder clássico e com o BuildKit. Build, da raiz do repositório: docker build -f infra/docker/motor.Dockerfile -t zentrade-motor .
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
RUN pnpm --filter "@zentrade/motor..." build
RUN pnpm --filter @zentrade/motor deploy --prod /saida
# Robôs de exemplo (só papel/observar); troque por um volume com MOTOR_ROBOS_ARQUIVO.
RUN cp apps/motor/robos.exemplo.json /saida/

FROM ${NODE_IMAGEM} AS execucao
ENV NODE_ENV=production
WORKDIR /app
COPY --from=construir --chown=node:node /saida ./
USER node
# O motor não tem porta: a vida dele aparece em /api/v1/saude (batida no Redis).
# Aqui só conferimos que o processo principal está de pé.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "process.kill(1, 0)"
CMD ["node", "dist/main.js"]
