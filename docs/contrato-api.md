# Contrato entre os serviços

Fonte da verdade dos formatos: `packages/contratos` (esquemas Zod). Este documento fixa **quem fala com quem, por onde**. Decimais trafegam sempre como texto (`"0.00123"`); horários em milissegundos UTC.

## Serviços e portas (desenvolvimento)

| Serviço                           | Porta | Papel                                                          |
| --------------------------------- | ----- | -------------------------------------------------------------- |
| `apps/api`                        | 8080  | REST + WebSocket para a tela, CLI, MCP; recebe webhooks do n8n |
| `apps/agente`                     | 8081  | IA: `POST /analisar` (só rede interna)                         |
| `apps/motor`                      | —     | robôs ao vivo, backtests (fila), publica eventos               |
| `apps/web`                        | 5173  | interface (Vite)                                               |
| PostgreSQL (Timescale + pgvector) | 55432 | fonte da verdade                                               |
| Redis                             | 56379 | canal `zentrade:eventos` e fila BullMQ `backtests`             |
| n8n                               | 5678  | automações                                                     |

## Fluxos internos

- **Motor → banco:** grava decisões, ordens, execuções e candles pelas portas de `@zentrade/contratos` (`PortaDecisoes`, `PortaOrdens`, `PortaRobos`), implementadas em `packages/banco`.
- **Motor → Redis:** publica `Evento` (JSON) em `zentrade:eventos`. A API retransmite pelo WebSocket.
- **Motor → agente:** `POST http://agente:8081/analisar`, cabeçalho `Authorization: Bearer $AGENTE_SEGREDO`, corpo `PedidoAnalise` serializado (decimais em texto), resposta `{ proposta: PropostaAgente, custoUsd: "0.0123" }`. Timeout 60 s; falha = não operar.
- **API → motor (backtest):** job na fila BullMQ `backtests` com `{ backtestId }`; o motor grava o resultado no banco.
- **API → n8n:** `POST $N8N_URL/webhook/zentrade-proposta` (corpo `PropostaCriada`) e `POST $N8N_URL/webhook/zentrade-alerta` (`{ tipo, titulo, mensagem, em }`), ambos assinados.
- **n8n → API:** webhooks assinados em `/webhooks/n8n/*`.

Assinatura dos webhooks (os dois sentidos): cabeçalho `X-ZenTrade-Assinatura: t=<segundos>,v1=<hmac-sha256-hex de "t.corpo">`, segredo `N8N_WEBHOOK_SEGREDO` (≥ 32 caracteres), validade 5 min. Implementação: `assinar` / `verificar` em `@zentrade/contratos`.

## API REST (`/api/v1`)

Autenticação: sessão em cookie `httpOnly` + `SameSite=Strict` (tela) ou `Authorization: Bearer <token>` (CLI, MCP). Tokens têm escopo `leitura` ou `operar`. Ações críticas (desligar a parada total, cadastrar chave de corretora, ligar dinheiro real) exigem **reautenticação** nos últimos 5 minutos. Erros: `{ "erro": { "codigo": "texto_curto", "mensagem": "frase para a pessoa" } }`.

| Método e caminho                                            | Corpo / consulta                                            | Resposta                                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST /sessao`                                              | `{ email, senha, codigo2fa? }`                              | `{ usuario }` + cookie                                                               |
| `GET /sessao` · `DELETE /sessao`                            | —                                                           | `{ usuario }` · 204                                                                  |
| `POST /sessao/confirmar`                                    | `{ senha }` ou `{ codigo2fa }`                              | 204 (reautentica por 5 min)                                                          |
| `GET /resumo`                                               | —                                                           | `{ resultadoHoje, exposicao, maiorQueda30d, robosAtivos, custoIaHoje, paradaTotal }` |
| `GET /estrategias` · `POST /estrategias`                    | `EstrategiaDTO` sem `id`/`versao`                           | lista · criada (versão 1)                                                            |
| `GET /estrategias/:id` · `POST /estrategias/:id/versoes`    | nova versão completa                                        | detalhe com versões · nova versão                                                    |
| `GET /robos` · `POST /robos`                                | `RoboDTO` sem `id`/`criadoEm`/`pausado`                     | lista · criado (sempre em `observar`)                                                |
| `GET /robos/:id` · `PATCH /robos/:id`                       | `{ nome?, modo?, limites?, pausado? }`                      | `RoboDTO` (`modo: auto` com `rede: real` exige reautenticação)                       |
| `GET /robos/:id/posicao`                                    | —                                                           | `PosicaoDTO`                                                                         |
| `GET /decisoes`                                             | `?roboId&estado&antes&limite` (≤ 200)                       | `DecisaoDTO[]`, mais recentes primeiro                                               |
| `GET /decisoes/:id`                                         | —                                                           | `DecisaoDTO` + ordem, se houver                                                      |
| `POST /decisoes/:id/aprovar` · `/recusar`                   | —                                                           | `DecisaoDTO` (só em `aguardando_aprovacao` e antes de expirar)                       |
| `GET /ordens`                                               | `?roboId&limite`                                            | `OrdemDTO[]`                                                                         |
| `GET /mercado/:simbolo/candles`                             | `?intervalo&inicio&fim`                                     | `[{ abertura, abre, maxima, minima, fecha, volume }]`                                |
| `POST /parada-total`                                        | `{ ligada: boolean }`                                       | `{ ligada }` (desligar exige reautenticação)                                         |
| `GET /contas-corretora` · `POST` · `DELETE /:id`            | `{ corretora: "binance", rede, apiKey, apiSecret }`         | nunca devolve o segredo; só `apiKeyFinal: "…a1b2"`                                   |
| `GET /tokens` · `POST` · `DELETE /:id`                      | `{ nome, escopo }`                                          | o token em claro aparece **uma vez**, na criação                                     |
| `POST /backtests` · `GET /backtests/:id`                    | `{ estrategiaId, versao, simbolo, intervalo, inicio, fim }` | `{ id, estado }` · resultado com métricas e curva                                    |
| `GET /conhecimento/documentos` · `POST /conhecimento/notas` | `{ titulo, texto }`                                         | lista · criada                                                                       |
| `GET /saude` (público)                                      | —                                                           | `{ ok, servicos: { banco, redis, motor, agente } }`                                  |
| `GET /tempo-real` (WebSocket)                               | —                                                           | fluxo de `Evento`                                                                    |

## Webhooks (`/webhooks/n8n`, assinados, sem sessão)

| Caminho                           | Corpo                                         | Efeito                                                         |
| --------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| `POST /webhooks/n8n/aprovacao`    | `RespostaAprovacao`                           | aprova ou recusa a decisão (se ainda valer)                    |
| `POST /webhooks/n8n/conhecimento` | `{ fonte, titulo, url?, publicadoEm, texto }` | ingere no RAG                                                  |
| `POST /webhooks/n8n/saude`        | —                                             | `{ motorVivoHaSegundos, robosPausados }` para o vigia de saúde |

## Esquema do RAG (tabelas em `packages/banco`)

```sql
documentos(id uuid pk, usuario_id uuid not null, fonte text check (fonte in ('diario','noticia','regra_corretora','estrategia','nota')),
           titulo text not null, url text, publicado_em timestamptz not null, hash_conteudo text not null,
           criado_em timestamptz not null default now(), unique (usuario_id, hash_conteudo))
trechos(id uuid pk, documento_id uuid not null references documentos on delete cascade, usuario_id uuid not null,
        ordem int not null, texto text not null, embedding vector(1024) not null,
        busca tsvector generated always as (to_tsvector('simple', texto)) stored, criado_em timestamptz not null default now())
-- índices: hnsw (embedding vector_cosine_ops), gin (busca), (usuario_id, documento_id)
```

Embeddings com 1024 dimensões (Voyage e o modelo local `bge-m3` produzem 1024).
