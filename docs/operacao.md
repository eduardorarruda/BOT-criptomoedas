# Operação

Como colocar o ZenTrade de pé e conduzir um robô da observação até o modo automático, com segurança. Leia também [segurança](seguranca.md) e [estratégias](estrategias.md).

> **Estado do projeto.** Os quatro serviços (`apps/api`, `apps/motor`, `apps/agente`, `apps/web`) existem, têm testes e sobem juntos pelo `docker-compose` (perfil `app`). O que ainda **não** foi exercitado de ponta a ponta: ordens na testnet da Binance com chave de verdade, análises com a API da Anthropic de verdade e os fluxos do n8n contra o Telegram. Os passos abaixo seguem o [contrato entre os serviços](contrato-api.md); o que ainda falta está marcado como **pendente**.

## Subir o ambiente

Requisitos: Node 24, Docker e um servidor (ou máquina) com IP fixo, se for usar dinheiro real.

```bash
git clone <repositório> zentrade && cd zentrade
corepack pnpm install
cp .env.example .env        # preencha; o .env nunca vai para o git
corepack pnpm check         # lint, tipos e testes
```

Segredos que você gera (cada um com `openssl rand -hex 32`, guardados num gerenciador de senhas):

| Variável                | Para quê                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| `N8N_WEBHOOK_SEGREDO`   | assinatura dos webhooks entre a API e o n8n (32+ caracteres)       |
| `AGENTE_SEGREDO`        | autenticação do motor no agente de IA                              |
| `ZENTRADE_CHAVE_MESTRA` | cifra das chaves da corretora e do 2FA (`openssl rand -base64 32`) |

### Tudo em containers (perfil `app`)

```bash
docker compose --env-file .env -f infra/docker-compose.yml --profile app up -d --build
```

Sobe banco, Redis e n8n, aplica as migrações (serviço `migrar`, que sai ao terminar) e só então a API, o motor, o agente e a tela. A tela fica em <http://localhost:8088> (nginx, com a API atrás de `/api`); a API também responde em `127.0.0.1:8080` para a CLI. Tudo preso em `127.0.0.1`; o agente e o motor não publicam porta. As portas mudam por `*_PORTA_HOST` no `.env`. Com o perfil `app`, ponha `ZENTRADE_API_URL_PARA_N8N=http://api:8080` para o n8n achar a API.

O motor sobe em papel com o agente fixo (`MOTOR_AGENTE_FIXO`); para usar a IA, defina `MOTOR_AGENTE_URL=http://agente:8081` e `AGENTE_SEGREDO`. O agente precisa de `ANTHROPIC_API_KEY` para subir, e os embeddings de `VOYAGE_API_KEY` (ou `EMBEDDINGS_PROVEDOR=ollama` com o Ollama no host).

Para derrubar: `docker compose -f infra/docker-compose.yml --profile app down` (com `-v` apaga também os dados).

### Desenvolvimento sem Docker para os serviços

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d   # só banco, Redis e n8n
corepack pnpm --filter @zentrade/banco build && corepack pnpm --filter @zentrade/banco migrar
corepack pnpm dev           # API (8080) e tela (5173) com recarga
corepack pnpm dev:motor     # motor, em outro terminal
corepack pnpm dev:agente    # agente, em outro terminal (opcional)
```

Serviços e portas em desenvolvimento: API `8080`, agente `8081` (só rede interna), tela `5173`, PostgreSQL `55432`, Redis `56379`, n8n `5678`.

Confira a saúde: `GET /api/v1/saude` responde `{ ok, servicos: { banco, redis, motor, agente } }` sem precisar de login. `motor: true` depende da batida que o motor grava no Redis (`zentrade:motor:batida`); **pendente:** o motor desta versão ainda não grava essa batida, então aparece `false` mesmo no ar.

## Criar o primeiro usuário

A pessoa é criada por linha de comando (não há cadastro aberto pela tela). A senha é pedida sem eco (mínimo 12 caracteres):

```bash
corepack pnpm --filter @zentrade/api build
corepack pnpm --filter @zentrade/api criar-usuario -- --email voce@exemplo.com --nome "Você"
# no Docker:
docker compose --env-file .env -f infra/docker-compose.yml --profile app run --rm api \
  node dist/comandos/criar-usuario.js --email voce@exemplo.com --nome "Você"
```

Com mais de uma pessoa cadastrada, defina `N8N_USUARIO_ID` com o id de quem recebe as notícias do n8n (o comando mostra o id); sem isso, a API recusa o conhecimento que chega pelo n8n. Depois de criada:

1. Entre pela tela (`POST /api/v1/sessao` por trás).
2. Ligue o **2FA** logo no primeiro acesso.
3. Crie os tokens de que vai precisar (tela → Tokens): um de **leitura** e um de **operar** para o n8n. O token aparece uma vez só; cole direto na credencial do n8n.

## Conectar a testnet

1. Crie uma conta em <https://testnet.binance.vision> e gere uma chave de API (o saldo é fictício).
2. Na tela, cadastre a conta da corretora (rede `testnet`, chave e segredo). A tela pede sua senha ou código 2FA de novo (reautenticação), e depois só mostra o final da chave (`…a1b2`).
3. No `.env` do motor, use `MOTOR_REDE=testnet` e a **mesma** `ZENTRADE_CHAVE_MESTRA` da API: cada robô opera com a chave da pessoa dona dele, decifrada do banco. `BINANCE_API_KEY`/`BINANCE_API_SECRET` só valem com `ZENTRADE_AMBIENTE=desenvolvimento` (atalho para quem ainda não cadastrou chave).
4. Em **Carteira**, use "Sincronizar agora" para importar saldos e negociações (uma chave só de leitura basta para isso). Detalhes em [carteira.md](carteira.md).

Quando for para a rede real, repita com uma chave **sem permissão de saque** e **restrita ao IP do servidor**.

## Criar um robô em observar

1. Monte a estratégia na tela (ou `POST /api/v1/estrategias`). Comece pelo [exemplo média + RSI](estrategias.md#exemplo-média--rsi).
2. Rode um **backtest** (`POST /api/v1/backtests`) e leia com calma ([como ler](estrategias.md#como-ler-o-backtest)).
3. Crie o robô (`POST /api/v1/robos`): símbolo, intervalo, estratégia e limites de risco. Ele **sempre nasce em `observar`**.
4. Em `observar`, cada sinal vira uma decisão registrada com o porquê, mas nenhuma ordem sai. Acompanhe na tela ou em `GET /api/v1/decisoes` e no relatório diário das 21h.

Limites de risco para começar (ajuste ao seu caso, sempre pequenos):

| Limite              | Sugestão inicial                          |
| ------------------- | ----------------------------------------- |
| risco por operação  | 0,5% a 1% do valor que você aceita perder |
| perda diária máxima | 2 a 3 vezes o risco por operação          |
| exposição máxima    | uma fração pequena do saldo               |
| ordens por hora     | 2 a 4                                     |
| pausa após perda    | 60 minutos                                |
| confiança mínima    | 0,6                                       |

## Passar para sugerir e depois auto

**Sugerir** (`PATCH /api/v1/robos/:id` com `{ "modo": "sugerir" }`): cada proposta aprovada pelo risco chega no Telegram com Aprovar/Recusar e vale por poucos minutos. Sem resposta, expira. Bom para sentir o robô decidindo sem entregar a ele o gatilho.

**Auto** (`{ "modo": "auto" }`): as ordens saem sozinhas, sempre depois do motor de risco. Com `rede: real`, a API exige reautenticação.

Antes de cada passo, confira:

- [ ] O robô passou pelo menos algumas semanas no modo anterior, em mercados diferentes.
- [ ] As decisões fazem sentido quando você lê o porquê.
- [ ] As barreiras do risco aparecem quando deveriam (veja o relatório diário).
- [ ] Os limites cabem no que você aceita perder num dia ruim.
- [ ] O vigia de saúde e os alertas estão funcionando (teste conforme [infra/n8n](../infra/n8n/README.md#6-testar-cada-fluxo)).

Para voltar atrás, mude o modo de novo ou pause o robô (`{ "pausado": true }`).

## Parada total

A parada total barra **toda entrada nova** de todos os robôs: nenhuma compra, nenhuma venda pela regra de saída ou por tempo, e o agente não é consultado. O motor a lê a cada decisão. A **proteção continua**: o stop e o alvo combinados na compra seguem no livro da corretora e o robô segue vendendo no stop e no alvo ([ADR 007](adr/007-protecao-sai-sempre.md)). Pausar um robô faz o mesmo só com ele; robô pausado com posição aberta continua ligado até a posição fechar.

- **Ligar:** botão na tela, ou
  ```bash
  curl -X POST "$ZENTRADE_API_URL/api/v1/parada-total" \
    -H "Authorization: Bearer $ZT_TOKEN_OPERAR" -H "content-type: application/json" \
    -d '{ "ligada": true }'
  ```
- **Automática:** o fluxo `zentrade-vigia-saude` liga sozinho se o motor ficar mais de 3 minutos sem dar sinal, e avisa no Telegram.
- **Desligar:** só pela tela, com reautenticação. De propósito: quem desliga precisa ser uma pessoa olhando o que aconteceu.

Ligue sem medo quando tiver dúvida. O custo é perder oportunidades; posições abertas continuam protegidas pelo stop e pelo alvo no livro da corretora, e você pode encerrá-las pela própria Binance (cancele a ordem de proteção do robô antes de vender, senão a base está travada nela).

## Stop na corretora

Depois de cada compra executada, o motor deixa no livro da corretora a proteção da posição: um **OCO** (alvo `LIMIT_MAKER` + `STOP_LOSS_LIMIT`) ou só o stop-limit, se o preço já passou do alvo. Ela vale mesmo com o motor fora do ar. Na tela, a posição mostra "Stop na corretora: ativo a X".

- `MOTOR_STOP_NA_CORRETORA` (padrão `true`) liga e desliga. Desligado, só o robô vigia o stop, no fechamento de cada minuto.
- `MOTOR_STOP_LIMITE_BPS` (padrão `100` = 1%): quanto abaixo do gatilho fica o preço limite da venda. Maior = executa em quedas mais rápidas, com pior preço. Se o preço passar do limite sem executar, o robô cancela e vende a mercado no fechamento do minuto seguinte (com o motor no ar).
- O motor confere a proteção a cada candle: o que ela executou vira a venda que fecha a posição (uma vez só) e, se o stop efetivo mudar (stop móvel, empate), a ordem é trocada. Antes de o robô vender por conta própria, ela sai do livro.
- Na partida, a proteção do banco é conferida contra a corretora: se o stop executou com o motor parado, a venda é gravada; se a ordem sumiu (cancelada por fora), outra é colocada.
- Recusa da corretora (ex.: filtro de preço), poeira (posição abaixo do mínimo da corretora) e saldo menor que a posição aparecem como aviso de risco na tela, uma vez. Poeira não tem ordem que a venda: recolha na Binance em "Converter saldos pequenos em BNB".
- **Vender na mão:** a proteção trava a base; se você cancelá-la na Binance com o robô ligado (mesmo pausado), o motor coloca outra no candle seguinte. Para fechar a posição na mão, desligue antes a proteção na corretora (`MOTOR_STOP_NA_CORRETORA=false`) ou deixe o robô sair pelo stop, pelo alvo ou pela regra. Um comando "zerar posição" na tela ainda não existe; quando existir, ele sai como proteção (nada o barra).

## Assistente e o Claude Code (o seu plano)

O analista dos robôs e o **Assistente** (o chat em Acompanhar → Assistente) podem responder por dois "cérebros", escolhidos por pessoa em **Assistente → Configurações**:

| Provedor                  | Como funciona                                                                    | Precisa de                                        |
| ------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| Claude pela API           | O SDK da Anthropic, pago por uso. O custo de cada análise fica na decisão.       | `ANTHROPIC_API_KEY` no agente                     |
| Claude Code (o seu plano) | O agente roda `claude -p` com o login da pessoa, dentro do limite do plano dela. | O CLI instalado no agente e o login feito uma vez |

Nos dois casos o analista **só propõe** (a saída é a `PropostaAgente`, validada; fora do esquema vira "aguardar") e as ferramentas são **só de leitura**. No Claude Code, as ferramentas nativas ficam desligadas (`--tools ""`, `--restricted`, nada de Bash, Edit, Write ou WebFetch), as configurações do usuário são ignoradas e só a ponte MCP do ZenTrade é liberada; o ambiente do processo não leva `ANTHROPIC_API_KEY` nem os segredos do ZenTrade. Quem nunca escolheu fica com a API, se o agente tiver a chave, senão com o Claude Code.

> **Termos de uso.** Usar o Claude Code pelo plano (Pro, Max, Team…) segue os termos da Anthropic: o plano é **pessoal**, para a própria pessoa usar. Não compartilhe a conta de uma pessoa com outras, nem use o plano de alguém para atender terceiros. Para uso por várias pessoas ou automatizado em escala, use a API.

### Fazer o login uma vez (Docker)

A imagem do agente já traz o `claude` (repositório apk assinado da Anthropic, canal stable). O login fica no volume `claude-contas`, montado em `/dados/claude`, e sobrevive à troca do container. Cada conta é uma pasta (`CLAUDE_CONFIG_DIR`):

```bash
# entre no agente e abra o Claude Code com a pasta da conta "principal"
docker compose --env-file .env -f infra/docker-compose.yml --profile app exec -it agente \
  sh -c 'CLAUDE_CONFIG_DIR=/dados/claude/principal claude'
# dentro dele: /login, abra o link no navegador, entre com a conta do SEU plano e cole o código.
# Depois: /exit. Confira: a conta aparece "com login" em Assistente → Configurações.
```

Para conferir sem abrir a tela: `docker compose … exec agente sh -c 'CLAUDE_CONFIG_DIR=/dados/claude/principal claude auth status'`. Se o login expirar, o analista falha com uma mensagem clara (o robô não opera naquele sinal) e o assistente mostra "faça o login de novo": repita o passo acima.

### Várias contas

Cada pessoa usa o próprio plano. Liste as contas no `.env` (id=pasta, separadas por vírgula) e faça o login de cada uma na pasta dela:

```bash
AGENTE_CLAUDE_CONTAS=ana=/dados/claude/ana,beto=/dados/claude/beto
docker compose … exec -it agente sh -c 'mkdir -p /dados/claude/ana && CLAUDE_CONFIG_DIR=/dados/claude/ana claude'
```

Cada pessoa escolhe a **sua** conta em Assistente → Configurações. As pastas são definidas por quem opera o servidor; a tela só mostra os ids, nunca os caminhos.

### Sem Docker

Instale o Claude Code na máquina do agente (`curl -fsSL https://claude.ai/install.sh | bash`), faça o login com `claude` e deixe `AGENTE_CLAUDE_CONTAS` vazio para usar o login padrão (`~/.claude`) do usuário que roda o agente — ou aponte contas para outras pastas, como acima. `AGENTE_CLAUDE_CAMINHO` diz onde está o executável (padrão: `claude` no `PATH`).

### Tetos e passos ao vivo

- `AGENTE_CLI_MAX_TURNOS` (padrão 8) e `AGENTE_CLI_TETO_USD` (padrão 1) limitam cada execução do Claude Code (`--max-turns` e `--max-budget-usd`); `AGENTE_TIMEOUT_MS` é o prazo da análise e `AGENTE_CHAT_TIMEOUT_MS` o de uma resposta do chat.
- Com `REDIS_URL` no agente, cada ferramenta consultada numa análise aparece ao vivo na tela (evento `analise` em `zentrade:eventos`, ligado ao `analiseId` do pedido do motor), nos dois provedores.
- A API precisa de `AGENTE_URL` e `AGENTE_SEGREDO` para o assistente; sem elas, as rotas do assistente respondem 503 e o resto segue normal.

## Backups

O que guardar, e onde:

| O quê                    | Como                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Banco (fonte da verdade) | `pg_dump -h 127.0.0.1 -p 55432 -U <usuário> -Fc <banco> > zentrade-$(date +%F).dump`           |
| `.env` (segredos)        | no gerenciador de senhas, nunca junto do dump                                                  |
| n8n                      | `N8N_ENCRYPTION_KEY` no gerenciador de senhas + volume de dados do n8n; os fluxos estão no git |

Boas práticas: backup diário, cifrado (ex.: `age` ou `gpg`) e fora do servidor; mantenha alguns dias, semanas e meses. **Teste a restauração** de vez em quando num banco separado (`pg_restore -d <banco_teste> arquivo.dump`). Backup que nunca foi restaurado é esperança, não backup.

O Redis não precisa de backup: eventos e fila se refazem.

## Quando algo dá errado

Primeiro passo, sempre: **na dúvida, ligue a parada total**. Depois investigue.

| Sintoma                                | O que fazer                                                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aviso "motor sem sinal" no Telegram    | A parada total já foi ligada; as posições seguem com o stop no livro da corretora. Veja os logs do motor e `GET /api/v1/saude`. Com o motor de volta, confira posições e decisões e só então desligue a parada pela tela. |
| Aviso "API não respondeu"              | O vigia não consegue ligar a parada por ela. Entre no servidor; se precisar, pare o motor (`docker stop`) — sem motor, nenhuma ordem nova sai; o stop e o alvo que já estão no livro da corretora continuam valendo.      |
| Decisões sem proposta da IA            | O agente caiu, demorou mais de 60 s ou respondeu fora do esquema. O robô não opera nesses casos. Veja os logs do agente e o custo de IA no relatório.                                                                     |
| Ordem rejeitada pela corretora         | O motivo fica na ordem (`GET /api/v1/ordens`). Comum: filtros de lote ou valor mínimo mudaram, saldo insuficiente, chave sem permissão de negociar.                                                                       |
| Posição na tela diferente da corretora | A posição é calculada das execuções confirmadas. Procure ordem pendente ou parcial; o motor reconcilia pelo `idCliente`. Não "corrija" a posição na mão.                                                                  |
| Aviso "a corretora recusou o stop"     | A proteção não entrou no livro (o motivo vem da Binance). O robô segue vigiando o stop no fechamento de cada minuto e tenta de novo em 5 min. Confira filtros do par e saldo livre.                                       |
| Aviso "poeira"                         | A posição ficou abaixo do mínimo da corretora: nenhuma ordem a vende, nem o stop. Recolha na Binance ("Converter saldos pequenos em BNB").                                                                                |
| Perda diária atingida                  | Compras param até o dia seguinte; vendas que encerram posição continuam. Use a pausa para revisar a estratégia antes de mexer nos limites.                                                                                |
| Webhook do n8n devolvendo 401          | O segredo da credencial do n8n não é o mesmo de `N8N_WEBHOOK_SEGREDO`, ou o relógio de um dos servidores está errado (a assinatura vale 5 min).                                                                           |
| Webhook do n8n devolvendo 409          | `webhook_repetido`: a mesma requisição assinada chegou duas vezes (retentativa do n8n). Assine de novo a cada envio. `n8n_usuario_obrigatorio`: defina `N8N_USUARIO_ID`.                                                  |
| Telegram não recebe nada               | Confira a credencial do bot, `TELEGRAM_CHAT_ID` e se você mandou mensagem ao bot antes. Veja as execuções com erro no n8n.                                                                                                |
| O n8n caiu                             | O núcleo segue. Propostas em `sugerir` expiram sem resposta; alertas e relatório atrasam. Suba o n8n de novo.                                                                                                             |
| Suspeita de chave vazada               | Ligue a parada total, **apague a chave na Binance**, remova a conta-corretora na tela, gere uma nova (sem saque, com IP) e troque os segredos do `.env`.                                                                  |
| Assistente: "faça o login de novo"     | O login do Claude Code daquela conta expirou. Refaça como em [Assistente e o Claude Code](#fazer-o-login-uma-vez-docker), ou troque para a API nas configurações.                                                         |
| Suspeita de token vazado               | Revogue na tela (Tokens) e crie outro. Se for o do n8n, atualize a credencial.                                                                                                                                            |
