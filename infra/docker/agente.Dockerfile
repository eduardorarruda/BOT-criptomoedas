# Agente de IA do ZenTrade (POST /analisar e o assistente, só rede interna). Também traz a
# CLI `zentrade`, o servidor MCP (dist/cli/bin.js, dist/mcp/bin.js), a ponte MCP do
# provedor "cli" (dist/ponte/bin.js) e o Claude Code (`claude`) para quem usa o plano.
# Funciona com o builder clássico e com o BuildKit. Build, da raiz do repositório: docker build -f infra/docker/agente.Dockerfile -t zentrade-agente .
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
RUN pnpm --filter "@zentrade/agente..." build
RUN pnpm --filter @zentrade/agente deploy --prod /saida

FROM ${NODE_IMAGEM} AS execucao
# Claude Code (provedor "cli": o analista e o assistente pelo plano da pessoa). Instalado
# pelo repositório apk assinado da Anthropic, canal stable — o método da documentação
# oficial para Alpine (https://code.claude.com/docs/en/setup): libgcc, libstdc++ e o
# ripgrep do sistema, a chave conferida pelo SHA-256 publicado. Sem atualização
# automática no container: a versão muda ao reconstruir a imagem. Para uma imagem sem o
# CLI (só o provedor "api"): --build-arg CLAUDE_CODE=nao.
ARG CLAUDE_CODE=sim
ARG CLAUDE_CODE_CHAVE_SHA256=395759c1f7449ef4cdef305a42e820f3c766d6090d142634ebdb049f113168b6
RUN if [ "$CLAUDE_CODE" = "sim" ]; then \
      apk add --no-cache libgcc libstdc++ ripgrep \
      && wget -qO /etc/apk/keys/claude-code.rsa.pub https://downloads.claude.ai/keys/claude-code.rsa.pub \
      && echo "$CLAUDE_CODE_CHAVE_SHA256  /etc/apk/keys/claude-code.rsa.pub" | sha256sum -c - \
      && echo "https://downloads.claude.ai/claude-code/apk/stable" >> /etc/apk/repositories \
      && apk add --no-cache claude-code \
      && claude --version; \
    fi
# Pasta das contas do Claude Code (uma subpasta por conta, CLAUDE_CONFIG_DIR): um volume,
# para o login sobreviver à troca do container. Veja docs/operacao.md.
ENV NODE_ENV=production AGENTE_HOST=0.0.0.0 AGENTE_PORTA=8081 \
    USE_BUILTIN_RIPGREP=0 DISABLE_AUTOUPDATER=1 \
    AGENTE_CLAUDE_CONTAS=principal=/dados/claude/principal
RUN mkdir -p /dados/claude/principal && chown -R node:node /dados && chmod -R 700 /dados/claude
VOLUME ["/dados/claude"]
WORKDIR /app
COPY --from=construir --chown=node:node /saida ./
USER node
EXPOSE 8081
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:8081/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/principal.js"]
