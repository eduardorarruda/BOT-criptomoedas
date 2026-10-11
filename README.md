<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/simbolo.svg">
    <img src="brand/simbolo-claro.svg" alt="Símbolo do ZenTrade: um círculo aberto com um candle na abertura" width="96">
  </picture>
</p>

<h1 align="center">ZenTrade</h1>

<p align="center"><b>Um robô de trading que espera o momento certo.</b><br>
Regras decidem. A IA argumenta. O risco tem a palavra final.</p>

<p align="center">
  <a href="LICENSE"><img alt="Licença AGPL-3.0" src="https://img.shields.io/badge/licen%C3%A7a-AGPL--3.0-0E6B47"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-estrito-3DDC8E">
  <img alt="Status" src="https://img.shields.io/badge/status-em%20constru%C3%A7%C3%A3o-E9B44C">
</p>

---

> **Em construção.** Os serviços existem, têm testes e sobem juntos com Docker, mas nada aqui opera dinheiro real: o motor só liga em papel (simulado) ou na testnet da Binance. Veja o [status honesto](#status) antes de confiar em qualquer parte.

## O que é

O ZenTrade observa o mercado de cripto, segue as estratégias que você monta e, quando uma delas dá sinal, chama um agente de IA para analisar o momento: casos parecidos no histórico, notícias recentes, regras da corretora. O agente devolve uma proposta com raciocínio e fontes. Um **motor de risco determinístico** — código simples, testado, sem IA — aprova ou barra. Só então a ordem sai.

Se a IA errar, alucinar ou sair do ar, o pior que acontece é **não operar**. A IA nunca envia ordem.

## Princípios

- **Dinheiro é decimal exato.** Nunca ponto flutuante.
- **A posição é derivada** das execuções confirmadas pela corretora, nunca gravada em dobro.
- **Toda compra tem stop**, e o alvo cobre as duas taxas.
- **Toda decisão explica o porquê**, com as fontes, e guarda o desfecho.
- **Dinheiro real por último**: robô novo nasce observando, na testnet ou em papel.

## Estrutura

```
apps/
  api/           REST + WebSocket para a tela, CLI e MCP; recebe os webhooks do n8n (Fastify)
  motor/         robôs ao vivo, ciclo de decisão com risco, ordens e backtest
  agente/        analista de IA (só propõe): serviço HTTP, CLI `zentrade` e servidor MCP
  web/           a tela (React + Vite), com modo de demonstração sem API
packages/
  dominio/       regras puras: dinheiro exato, indicadores, árvore de regras, risco, posição
  contratos/     esquemas Zod entre os serviços, portas e assinatura dos webhooks
  corretora/     Binance spot (REST e WebSocket) e corretora de papel
  banco/         PostgreSQL: esquema (Drizzle), migrações, RLS e repositórios
  conhecimento/  RAG: divisor, embeddings (Voyage ou Ollama), ingestão e busca híbrida
infra/
  docker/        Dockerfile multi-estágio por serviço e o nginx da tela
  docker-compose.yml  banco, Redis e n8n; perfil "app" sobe tudo junto
  n8n/           fluxos de automação versionados
  teste/         banco e Redis descartáveis para os testes de integração
tools/
  n8n-validacao/ testes dos fluxos do n8n contra o contrato
docs/            arquitetura, contrato, operação, estratégias, segurança e ADRs
```

## Como rodar

Requer Node 24 (pnpm pelo corepack) e Docker. Comece copiando o `.env.example` para `.env` e preenchendo os segredos (cada um com `openssl rand -hex 32`; a chave mestra com `openssl rand -base64 32`).

### Tudo com Docker

```bash
cp .env.example .env    # preencha; com o perfil app, ZENTRADE_API_URL_PARA_N8N=http://api:8080
docker compose --env-file .env -f infra/docker-compose.yml --profile app up -d --build
docker compose --env-file .env -f infra/docker-compose.yml --profile app run --rm api \
  node dist/comandos/criar-usuario.js --email voce@exemplo.com --nome "Você"
```

A tela fica em <http://localhost:8088> e a API em `127.0.0.1:8080` (`GET /api/v1/saude` sem login). As migrações rodam sozinhas antes da API. O motor sobe em papel com um agente fixo; o agente de IA precisa de `ANTHROPIC_API_KEY` para subir e de `VOYAGE_API_KEY` (ou `EMBEDDINGS_PROVEDOR=ollama`) para o conhecimento. Tudo fica preso em `127.0.0.1`.

### Desenvolvimento

```bash
corepack pnpm install
docker compose --env-file .env -f infra/docker-compose.yml up -d     # só banco, Redis e n8n
corepack pnpm --filter @zentrade/banco build && corepack pnpm --filter @zentrade/banco migrar
corepack pnpm dev          # API (8080) e tela (5173) com recarga
corepack pnpm dev:motor    # motor, em outro terminal
corepack pnpm dev:agente   # agente de IA (opcional)
```

Só a tela, com dados de mentira e sem nada rodando: `corepack pnpm --filter @zentrade/web demo`.

### Testes

```bash
corepack pnpm check                 # lint, tipos e testes de unidade (cobertura mínima de 80%)
corepack pnpm test:integracao       # sobe Postgres e Redis descartáveis e testa API, banco, agente e RAG
infra/teste/descer.sh               # derruba os containers de teste
```

## Automações (n8n)

Seis fluxos em [`infra/n8n`](infra/n8n/README.md), fora do núcleo: notícias para o conhecimento do agente, aprovação das sugestões pelo Telegram, alertas, relatório diário, vigia de saúde (liga a parada total se o motor sumir) e revalidação semanal das estratégias. Nenhum envia ordem. A API e o n8n se falam por webhooks assinados (HMAC, validade de 5 minutos e uso único); o status do que a API viu dos fluxos aparece na tela, em Automações.

## Status

O que existe e tem teste automatizado:

- **Domínio, contratos e risco**: regras puras com cobertura alta; dimensionamento por busca binária; posição derivada das execuções.
- **Banco**: esquema, migrações e RLS testados contra PostgreSQL de verdade (Timescale + pgvector).
- **API**: autenticação (sessão, CSRF, 2FA, reautenticação, tokens com escopo), robôs, decisões, backtests, conhecimento, automações, patrimônio e webhooks com anti-replay, testados contra PostgreSQL e Redis de verdade.
- **Motor**: ciclo de decisão completo em papel, com corretora simulada e testes de ponta a ponta.
- **Agente**: análise com saída estruturada, ferramentas só de leitura, CLI e MCP, testados com um cliente da Anthropic falso.
- **Tela**: todas as páginas, com modo de demonstração e testes de componentes.
- **Docker**: as quatro imagens constroem e o perfil `app` sobe com o motor em papel e o agente fixo.

O que **ainda não foi testado contra o serviço real** (só com dublês):

- ordens na **testnet da Binance** com chave de verdade;
- análises com a **API da Anthropic** de verdade (custo, latência, qualidade das propostas);
- embeddings pela **Voyage** de verdade (o Ollama local com `bge-m3` também não foi exercitado aqui);
- os fluxos do **n8n** importados num n8n real falando com o Telegram.

O que **falta**: o motor gravar decisões, ordens e eventos no banco e no Redis (hoje roda com portas em memória e robôs de um arquivo), bater em `zentrade:motor:batida` e consumir a fila de backtests; usar a conta da corretora cadastrada na tela em vez das chaves do ambiente.

## Documentação

- [Arquitetura](docs/arquitetura.md) — serviços, fluxo de uma decisão e princípios.
- [Contrato entre os serviços](docs/contrato-api.md) — rotas, webhooks, assinatura, filas e o esquema do RAG.
- [Operação](docs/operacao.md) — subir o ambiente, criar a primeira pessoa, levar um robô de observar a auto, parada total, backups.
- [Estratégias](docs/estrategias.md) — como montar e ler um backtest.
- [Segurança](docs/seguranca.md) e [ADRs](docs/adr/) — as decisões de fundo.

## Aviso

Software de apoio à decisão. Operar criptomoedas envolve risco de perda, inclusive total. Nada neste projeto é recomendação de investimento nem promessa de lucro.

## Licença

[AGPL-3.0](LICENSE). Contribuições seguem o [acordo de contribuição](CLA.md); veja [CONTRIBUTING.md](CONTRIBUTING.md) e [SECURITY.md](SECURITY.md).
