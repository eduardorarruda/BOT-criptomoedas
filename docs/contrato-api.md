# Contrato entre os serviços

Fonte da verdade dos formatos: `packages/contratos` (esquemas Zod). As respostas da API REST estão em [`api.ts`](../packages/contratos/src/api.ts) e [`backtest.ts`](../packages/contratos/src/backtest.ts); os corpos dos webhooks, em [`webhook-esquemas.ts`](../packages/contratos/src/webhook-esquemas.ts). A tela importa `@zentrade/contratos/esquemas`, subcaminho sem código de servidor (sem `node:crypto`). Este documento fixa **quem fala com quem, por onde**. Decimais trafegam sempre como texto (`"0.00123"`); horários em milissegundos UTC.

## Serviços e portas (desenvolvimento)

| Serviço                           | Porta | Papel                                                          |
| --------------------------------- | ----- | -------------------------------------------------------------- |
| `apps/api`                        | 8080  | REST + WebSocket para a tela, CLI, MCP; recebe webhooks do n8n |
| `apps/agente`                     | 8081  | IA: `POST /analisar` (só rede interna)                         |
| `apps/motor`                      | —     | robôs ao vivo, backtests (fila), publica eventos               |
| `apps/web`                        | 5173  | interface (Vite; no Docker, nginx na 8088)                     |
| PostgreSQL (Timescale + pgvector) | 55432 | fonte da verdade                                               |
| Redis                             | 56379 | eventos, fila, batida do motor, anti-replay, automações        |
| n8n                               | 5678  | automações                                                     |

## Fluxos internos

- **Motor → banco:** grava decisões, ordens, execuções e candles pelas portas de `@zentrade/contratos` (`PortaDecisoes`, `PortaOrdens`, `PortaRobos`), implementadas em `packages/banco`.
- **Motor → Redis:** publica `Evento` (JSON) em `zentrade:eventos`. A API retransmite pelo WebSocket.
- **Motor → Redis (batida):** grava em `zentrade:motor:batida` o instante (ms) em que esteve vivo pela última vez. A API considera o motor vivo se a batida tem até 120 s (`/saude` e o webhook do vigia).
- **Motor → agente:** `POST http://agente:8081/analisar`, cabeçalho `Authorization: Bearer $AGENTE_SEGREDO`, corpo `PedidoAnalise` serializado (decimais em texto), resposta `{ proposta: PropostaAgente, custoUsd: "0.0123" }`. Timeout 60 s; falha = não operar.
- **API → motor (backtest):** job na fila BullMQ `backtests` com `{ backtestId }` (o `jobId` é o próprio id: reenviar não duplica); o motor lê o pedido no banco e grava o resultado lá, com as métricas de `MetricasBacktestEsquema` (`resultadoLiquido`, `maiorQueda`, `maiorQuedaPercentual`, `operacoes`, `acertos`, `taxaAcerto`, `taxasPagas`; opcionais `patrimonioFinal`, `ordens`) e a curva `[{ em, patrimonio }]`. Métrica fora do contrato não sai pela API: o backtest aparece com `metricas: null` e um `erro` explicando.
- **API → n8n:** `POST $N8N_URL/webhook/zentrade-proposta` (corpo `PropostaCriada`) e `POST $N8N_URL/webhook/zentrade-alerta` (`{ tipo, titulo, mensagem, em }`), ambos assinados. O n8n responde **202** quando aceita, **401** com assinatura errada ou vencida e **400** com corpo fora do contrato.
- **n8n → API:** webhooks assinados em `/webhooks/n8n/*`.

### Assinatura dos webhooks (os dois sentidos)

Cabeçalho `X-ZenTrade-Assinatura: t=<segundos>,v1=<hmac-sha256-hex de "t.corpo">`, segredo `N8N_WEBHOOK_SEGREDO` (≥ 32 caracteres), validade 5 min. Implementação: `assinar` / `verificar` em `@zentrade/contratos`.

- A assinatura é sobre o **corpo bruto**, byte a byte, exatamente como sai no fio. Quem assina precisa mandar a mesma string que assinou (no n8n: corpo `raw`, `application/json`); reformatar o JSON depois de assinar invalida a assinatura.
- **Corpo vazio assina a string vazia** (`"t."`): é o caso de `POST /webhooks/n8n/saude`.
- **Uso único (anti-replay):** a API guarda cada assinatura aceita no Redis (`zentrade:webhook:assinatura:<caminho>:<v1>`, `SET NX EX`) pelo tempo em que ela ainda vale (até o carimbo + 5 min). A mesma requisição de novo recebe **409** `webhook_repetido`; para reenviar, assine de novo. Sem Redis, o webhook é recusado com **503** `anti_replay_indisponivel` (falha fechada).

## API REST (`/api/v1`)

**Autenticação.** Sessão em cookie `httpOnly` + `SameSite=Strict` (tela) ou `Authorization: Bearer <token>` (CLI, MCP, n8n). Tokens têm escopo `leitura` ou `operar`.

**CSRF.** `POST /sessao` e `GET /sessao` devolvem `{ usuario, csrf }`. Toda escrita com sessão (`POST`, `PATCH`, `DELETE`) leva o cabeçalho `x-csrf-token` com esse valor (também está no cookie legível `zt_csrf`). Sem ele: **403** `csrf_invalido`. Tokens Bearer não usam CSRF.

**Reautenticação.** Ações críticas (desligar a parada total, cadastrar chave de corretora, criar token, gerar o segredo do 2FA, ligar dinheiro real) exigem senha ou código 2FA confirmados nos últimos 5 minutos (`POST /sessao/confirmar`); o login conta como confirmação. Sem isso: **403** `reautenticacao_necessaria`. Ações críticas não aceitam token.

**Erros.** Sempre `{ "erro": { "codigo": "texto_curto", "mensagem": "frase para a pessoa" } }` (`ErroRespostaEsquema`). Códigos que quem chama costuma tratar: `nao_autenticado` (401), `codigo2fa_necessario` (401, o login pede o código do app), `reautenticacao_necessaria` (403), `csrf_invalido` (403), `escopo_insuficiente` / `exige_sessao` (403), `dados_invalidos` (400), `nao_encontrado` (404), `muitas_tentativas` (429).

**Prazo de aprovação.** Uma decisão em `aguardando_aprovacao` (modo Sugerir) vale `APROVACAO_VALIDADE_MIN` minutos (padrão 15); depois disso aprovar ou recusar devolve **409** e a decisão expira.

| Método e caminho                                            | Corpo / consulta                                                               | Resposta                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `POST /sessao`                                              | `{ email, senha, codigo2fa? }`                                                 | `{ usuario, csrf }` + cookies (com 2FA ativo e sem código: 401 `codigo2fa_necessario`)                                |
| `GET /sessao` · `DELETE /sessao`                            | —                                                                              | `{ usuario, csrf }` · 204                                                                                             |
| `POST /sessao/confirmar`                                    | `{ senha }` ou `{ codigo2fa }`                                                 | 204 (reautentica por 5 min)                                                                                           |
| `POST /sessao/2fa`                                          | — (crítica)                                                                    | `{ segredo, uri }` para o app autenticador (o 2FA só vale depois de ativar)                                           |
| `POST /sessao/2fa/ativar`                                   | `{ codigo }`                                                                   | 204 (2FA ligado)                                                                                                      |
| `GET /resumo`                                               | —                                                                              | `{ resultadoHoje, exposicao, maiorQueda30d, robosAtivos, custoIaHoje, taxasHoje, paradaTotal }` (dia UTC)             |
| `GET /patrimonio`                                           | `?dias` (1 a 365, padrão 30)                                                   | `[{ em, valor }]`: resultado realizado acumulado (líquido de taxas) ao fim de cada dia UTC, das execuções confirmadas |
| `GET /estrategias` · `POST /estrategias`                    | `EstrategiaDTO` sem `id`/`versao`                                              | lista · criada (versão 1)                                                                                             |
| `GET /estrategias/:id` · `POST /estrategias/:id/versoes`    | nova versão completa                                                           | detalhe com versões · nova versão                                                                                     |
| `GET /robos` · `POST /robos`                                | `RoboDTO` sem `id`/`criadoEm`/`pausado`                                        | lista · criado (sempre em `observar`)                                                                                 |
| `GET /robos/:id` · `PATCH /robos/:id`                       | `{ nome?, modo?, limites?, pausado? }`                                         | `RoboDTO` (sair de `observar` com `rede: real` exige 2FA ativo e reautenticação)                                      |
| `GET /robos/:id/posicao`                                    | —                                                                              | `PosicaoDTO`                                                                                                          |
| `GET /decisoes`                                             | `?roboId&estado&antes&limite` (≤ 200)                                          | `DecisaoDTO[]`, mais recentes primeiro                                                                                |
| `GET /decisoes/:id`                                         | —                                                                              | `DecisaoDetalhe` (`DecisaoDTO` + ordem, se houver)                                                                    |
| `POST /decisoes/:id/aprovar` · `/recusar`                   | —                                                                              | `DecisaoDTO` (só em `aguardando_aprovacao` e dentro do prazo)                                                         |
| `GET /ordens`                                               | `?roboId&limite`                                                               | `OrdemDTO[]`                                                                                                          |
| `GET /mercado/:simbolo/candles`                             | `?intervalo&inicio&fim`                                                        | `[{ abertura, abre, maxima, minima, fecha, volume }]`                                                                 |
| `GET /parada-total` · `POST /parada-total`                  | `{ ligada: boolean }`                                                          | `{ ligada }` (ligar vale até com token `operar`; desligar exige sessão e reautenticação)                              |
| `GET /contas-corretora` · `POST` · `DELETE /:id`            | `{ corretora: "binance", rede, apiKey, apiSecret }`                            | nunca devolve o segredo; só `apiKeyFinal: "…a1b2"` (só sessão; cadastrar é crítico; rede `real` exige 2FA)            |
| `GET /tokens` · `POST` · `DELETE /:id`                      | `{ nome, escopo }`                                                             | o token em claro aparece **uma vez**, na criação (só sessão; criar é crítico)                                         |
| `GET /backtests` · `POST /backtests` · `GET /backtests/:id` | `?limite` (≤ 50) · `{ estrategiaId, versao, simbolo, intervalo, inicio, fim }` | lista (com curva) · **202** com o backtest em `na_fila` (escopo `operar`) · backtest com métricas e curva             |
| `GET /conhecimento/documentos` · `POST /conhecimento/notas` | `{ titulo, texto }`                                                            | lista · documento com `novo` e `trechos` (201 novo, 200 conteúdo repetido; sem embeddings, 503 com o motivo)          |
| `GET /carteira` · `GET /carteira/:ativo`                    | `?rede` (`testnet`/`real`; padrão: real, se houver)                            | `Carteira` (robô × manual × total, por moeda) · `CarteiraAtivo` (+ negociações); veja [carteira.md](carteira.md)      |
| `POST /carteira/sincronizar`                                | `{ rede?, simbolos? }` (corpo opcional; 6 por minuto)                          | `Sincronizacao` (`negociacoesNovas`, `parcial`, `avisos`); 409 se já estiver sincronizando                            |
| `GET /binance/status`                                       | — (só sessão)                                                                  | `{ contas }`: conectada, `podeNegociar`, `podeSacar`, `ipRestrito` (null = desconhecido)                              |
| `GET /automacoes`                                           | —                                                                              | `Automacao[]`: fluxos do n8n que já deram sinal (lista vazia = nenhum sinal ainda)                                    |
| `GET /saude` (público)                                      | —                                                                              | `{ ok, servicos: { banco, redis, motor, agente } }` (503 se banco ou Redis caírem)                                    |
| `GET /tempo-real` (WebSocket)                               | —                                                                              | fluxo de `Evento`                                                                                                     |

Detalhes que valem para várias rotas:

- **Escopo dos tokens:** leituras (`GET`) aceitam `leitura`; escritas que operam (robôs, decisões, estratégias, parada total, backtests, notas) exigem `operar`. Contas, tokens e 2FA só pela tela, com sessão.
- **`/automacoes`:** a API não consulta o n8n. O status vem do que ela viu: webhooks assinados recebidos (`zentrade-vigia-saude` → `/webhooks/n8n/saude`, `zentrade-noticias` → `/conhecimento`, `zentrade-aprovacao` → `/aprovacao`) e avisos que ela enviou (`zentrade-aprovacao`, `zentrade-alertas`). Guardado no Redis em `zentrade:automacoes`. Fluxo agendado sem sinal há mais de 3 intervalos aparece com `ativa: false`. Relatório diário e revalidação semanal usam a API com token e não aparecem.
- **`/tempo-real`:** com sessão, só aceita a origem `ZENTRADE_ORIGEM_WEB`. A cada 30 s a API confere se a sessão ainda vale (ou se o token não foi revogado); se não, fecha a conexão com o código **4401**. Se não der para conferir (banco fora), fecha com **1011**.

### Ao vivo (`/aovivo`)

Para a tela "Ao vivo" abrir já preenchida, a API guarda os últimos eventos de cada robô que passaram pelo canal `zentrade:eventos`. O WebSocket `/tempo-real` continua sendo o fluxo ao vivo; estas rotas só contam o que aconteceu há pouco.

| Método e caminho               | Consulta                        | Resposta                                                                                                          |
| ------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /aovivo/:roboId/recentes` | `?limite` (1 a 400, padrão 400) | `{ eventos: [{ recebidoEm, evento }] }` do mais antigo ao mais novo; robô de outra pessoa ou inexistente: **404** |
| `GET /aovivo/recentes`         | `?limite` (1 a 400, padrão 400) | o mesmo, juntando todos os robôs da pessoa, ordenado por `recebidoEm`                                             |

- **Quais eventos:** `candle`, `sinal`, `analise`, `decisao`, `risco`, `ordem` e `posicao`. `preco` e `saude` não são de um robô e não entram (a tela recebe os preços pelo WebSocket). `evento` segue `EventoEsquema`; `recebidoEm` é a hora (ms) em que a API recebeu.
- **Guardado no Redis:** lista `zentrade:aovivo:robo:<roboId>` (mais novo primeiro), com teto de 400 e validade de 24 h renovada a cada evento. A ordem só diz a decisão: o robô vem do evento da decisão (lembrado em `zentrade:aovivo:decisao:<decisaoId>`, 24 h) ou, se a API não o viu, do banco. Gravação em fila, na ordem de chegada.
- **É memória curta, não fonte da verdade:** sem Redis, o evento não entra no histórico (fica no log) e as rotas respondem 500; decisões, ordens e posição continuam no banco e nas rotas de sempre. Escopo `leitura`.

## Webhooks (`/webhooks/n8n`, assinados, sem sessão)

| Caminho                           | Corpo                                         | Efeito                                                         |
| --------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| `POST /webhooks/n8n/aprovacao`    | `{ decisaoId, aprovada, porQuem }`            | aprova ou recusa a decisão (se ainda valer)                    |
| `POST /webhooks/n8n/conhecimento` | `{ fonte, titulo, url?, publicadoEm, texto }` | ingere no RAG (201 novo, 200 repetido)                         |
| `POST /webhooks/n8n/saude`        | —                                             | `{ motorVivoHaSegundos, robosPausados }` para o vigia de saúde |

Respostas comuns: **401** `assinatura_invalida` (ausente, errada ou vencida), **409** `webhook_repetido` (replay), **400** `json_invalido` ou `dados_invalidos`. O `url` do conhecimento só aceita `http://` ou `https://`.

**Dona do conhecimento.** O que chega por `/conhecimento` vai para `N8N_USUARIO_ID`. Com uma pessoa cadastrada, a variável pode ficar vazia (vai para ela). Com **mais de uma**, ela é obrigatória: sem ela, **409** `n8n_usuario_obrigatorio`; com um id que não existe, **409** `n8n_usuario_inexistente`.

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

Embeddings com 1024 dimensões (Voyage e o modelo local `bge-m3` produzem 1024). A ingestão é a mesma para a API e o agente (`ingerir` de `@zentrade/conhecimento`: normaliza, deduplica pelo hash do texto normalizado, divide em trechos e gera os embeddings), configurada por `EMBEDDINGS_PROVEDOR` (`voyage` ou `ollama`), `VOYAGE_API_KEY`, `VOYAGE_MODELO`, `OLLAMA_URL` e `OLLAMA_MODELO`.
