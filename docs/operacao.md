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

O motor sobe em papel com o agente fixo (`MOTOR_AGENTE_FIXO`); para usar a IA, defina `MOTOR_AGENTE_URL=http://agente:8081` e `AGENTE_SEGREDO`. O agente precisa de `ANTHROPIC_API_KEY` para subir, e os embeddings de `VOYAGE_API_KEY` (ou `EMBEDDINGS_PROVEDOR=ollama` com o Ollama no host, ou `EMBEDDINGS_PROVEDOR=nenhum` para a busca só por palavras; veja [base de conhecimento](#base-de-conhecimento-e-embeddings)).

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

Confira a saúde: `GET /api/v1/saude` responde `{ ok, servicos: { banco, redis, motor, agente }, conhecimento }` sem precisar de login (`conhecimento` diz se a busca está `hibrida`, só por `palavras` ou `desligada`). `motor: true` depende da batida que o motor grava no Redis (`zentrade:motor:batida`); **pendente:** o motor desta versão ainda não grava essa batida, então aparece `false` mesmo no ar.

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

## Base de conhecimento e embeddings

A base de conhecimento de cada pessoa (notas, arquivos, links, notícias do n8n) é o que o analista e o assistente consultam com `buscar_conhecimento`. A busca junta duas leituras: a **semântica**, por embeddings (vetores), e a **por palavras**, pelo full-text do PostgreSQL. `EMBEDDINGS_PROVEDOR` escolhe de onde vêm os embeddings, o mesmo para a API e o agente:

| `EMBEDDINGS_PROVEDOR` | Busca                         | Precisa de                                                                  | Custo e privacidade                              |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------ |
| `nenhum`              | só por palavras               | nada                                                                        | grátis; o texto não sai do servidor              |
| `voyage` (padrão)     | híbrida: semântica + palavras | `VOYAGE_API_KEY` ([dashboard.voyageai.com](https://dashboard.voyageai.com)) | pago por uso; o texto vai para a Voyage AI       |
| `ollama`              | híbrida, com o `bge-m3` local | Ollama no host (`OLLAMA_URL`) com `ollama pull bge-m3`                      | grátis; precisa de uma máquina que rode o modelo |

**Só por palavras (`nenhum`).** Notas, arquivos e links entram normalmente, só que sem vetor. A busca ignora acento e junta singular e plural ("acoes" acha "ações", "mini indice" acha "mini índice", "operações" acha "operação"), conta o título do documento e corta palavras vazias ("de", "para"). O que ela **não** faz é achar pelo sentido: "proteção da posição" não acha um texto que só diz "stop". A tela de Conhecimento avisa "Busca só por palavras (sem embeddings configurados)", `GET /api/v1/conhecimento/estado` e a saúde dizem o modo, e o agente avisa o modelo para procurar com os termos do texto.

**O padrão continua `voyage`, de propósito.** Sem `EMBEDDINGS_PROVEDOR` e sem chave, nada muda de modo sozinho: a API sobe com o conhecimento desligado (503 explicando, e a saúde diz `desligada`) e o agente não sobe, os dois com uma mensagem que sugere `nenhum`. Assim, uma chave que sumiu do `.env` não vira, sem ninguém ver, uma busca pior. O `.env.example` já vem com `nenhum`, para uma instalação nova funcionar de primeira; troque quando tiver a chave.

**Trocar de `nenhum` para `voyage` ou `ollama`.** Ponha o provedor e a chave no `.env`, reinicie a API e o agente e rode a reindexação, que calcula os vetores de tudo o que entrou sem eles:

```bash
corepack pnpm --filter @zentrade/api build
corepack pnpm --filter @zentrade/api reindexar-conhecimento                  # todas as pessoas
corepack pnpm --filter @zentrade/api reindexar-conhecimento -- --email voce@exemplo.com --lote 32
# no Docker:
docker compose --env-file .env -f infra/docker-compose.yml --profile app run --rm api \
  node dist/comandos/reindexar-conhecimento.js
```

Ela vai por pessoa, em lotes (`--lote`, padrão 64 trechos por chamada), mostra o progresso e grava cada lote na hora: se cair no meio (rede, limite da Voyage), rode de novo e ela continua de onde parou; sem nada pendente, não gasta nenhuma chamada. Enquanto isso, a busca já é híbrida para os trechos com vetor e por palavras para os que ainda não têm. `GET /api/v1/conhecimento/estado` mostra quantos trechos da pessoa esperam vetor (`trechosSemVetor`).

> **Trocar de `voyage` para `ollama` (ou de modelo)** não é coberto pela reindexação: os vetores que já existem são de outro modelo e não se comparam com os novos. Nesse caso, apague os vetores e rode de novo: `update trechos set embedding = null;` no banco e depois `reindexar-conhecimento`.

### Importar uma pasta de documentos

Para popular a base de uma pessoa de uma vez (por exemplo, as notas de partida em `conhecimento/semente`):

```bash
corepack pnpm --filter @zentrade/api build
corepack pnpm --filter @zentrade/api importar-conhecimento -- \
  --email voce@exemplo.com --pasta conhecimento/semente [--fonte nota]
```

- Lê cada `.md`, `.txt`, `.pdf`, `.docx` e `.html` da pasta e das subpastas, pelo mesmo caminho do envio pela tela: o tipo é conferido pelo conteúdo, PDF, DOCX e HTML são lidos numa thread isolada, o limite é 15 MB por arquivo, e o documento aparece na tela com origem "arquivo".
- Pula, dizendo o motivo, o que já existe (mesmo conteúdo, ou mesmo título e fonte), os tipos não suportados, arquivos vazios, ocultos (`.git`), links simbólicos e o `README` da pasta. Rodar de novo não duplica nada.
- O título é o do HTML (`<title>`) ou o nome do arquivo sem extensão. `--fonte` aceita `diario`, `noticia`, `regra_corretora`, `estrategia` ou `nota` (padrão).
- No fim, um resumo (`importados`, `já existiam`, `ignorados`, `falhas`); o código de saída é 1 se algum arquivo falhou. Com `nenhum`, os documentos entram sem vetor: rode a reindexação quando tiver um provedor.
- `--pasta` relativa vale a partir de onde você chamou o `pnpm` (a raiz do repositório, no exemplo).

No Docker, a pasta precisa estar dentro do container. Monte-a só para a importação:

```bash
docker compose --env-file .env -f infra/docker-compose.yml --profile app run --rm \
  -v "$PWD/conhecimento/semente:/importar:ro" api \
  node dist/comandos/importar-conhecimento.js --email voce@exemplo.com --pasta /importar
```

Ou copie-a para a API que já está no ar e importe de lá:

```bash
docker compose -f infra/docker-compose.yml --profile app cp conhecimento/semente api:/tmp/semente
docker compose --env-file .env -f infra/docker-compose.yml --profile app exec api \
  node dist/comandos/importar-conhecimento.js --email voce@exemplo.com --pasta /tmp/semente
```

A cópia em `/tmp` some quando o container é recriado; os documentos ficam no banco.

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

## Limites da conta

Além dos limites de cada robô, a tela **Risco → Limites da conta** define limites que somam **todos os robôs da pessoa na mesma rede** (papel, testnet e real são contas separadas e não se somam). Como os do robô, eles **só barram compras**: vendas, saídas pela regra e stops sempre passam. Vazio = sem limite.

| Limite               | O que conta                                                                                                                           | Quando volta                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Perda máxima do dia  | resultado realizado desde a meia-noite no fuso da instância, somando os robôs; opcionalmente com o não realizado das posições abertas | na virada do dia (meia-noite local)                       |
| Exposição máxima     | valor das posições abertas (ao último preço de 1 min; sem preço recente, ao preço médio) + a compra                                   | quando a exposição cair                                   |
| Posições abertas     | robôs com posição; só barra a compra que abriria mais uma                                                                             | quando uma posição fechar                                 |
| Queda máxima do pico | resultado realizado acumulado dentro da janela (padrão 72 h), partindo de zero: pico − atual (com o não realizado, se marcado)        | quando o pico sair da janela, ou **Liberar agora**        |
| Sequência de stops   | N saídas com perda em X horas (StoplossGuard), por robô, pela conta ou os dois                                                        | quando a mais antiga sair da janela, ou **Liberar agora** |

Detalhes que importam:

- **O dia é o do fuso da instância** (`ZENTRADE_FUSO`, padrão `America/Sao_Paulo`), igual ao limite do robô, ao resumo e ao relatório: começa à meia-noite local, não às 21h de Brasília (00:00 UTC). Os dados continuam gravados em UTC; com horário de verão, o dia pode ter 23 ou 25 horas.
- **Saída com perda** é qualquer venda que realizou prejuízo (stop ou regra de saída), contada pela execução, não pelo motivo da decisão: assim conta também a saída registrada a partir de um stop na própria corretora.
- **O pico vem do realizado** (como o MaxDrawdown do Freqtrade): oscilações não realizadas de uma posição não criam pico; o não realizado entra só no ponto de agora, se marcado.
- **Liberar agora** pede reautenticação e grava o instante: pico e perdas anteriores deixam de contar. Não mexe na perda do dia, nas divergências nem no orçamento de IA.
- **Afrouxar** (subir, tirar, encurtar a janela, deixar de somar o não realizado, estreitar o escopo dos stops) pede reautenticação; apertar vale na hora.
- Se o banco falhar ao ler a conta, o motor barra só a compra (`conta_indisponivel`) e segue vendendo e vigiando stops.

As pausas em vigor aparecem em **Risco → Pausas em vigor**, com o motivo e quando acabam, e viram [alerta](alertas.md).

## Reconciliação com a corretora

A cada `RECONCILIACAO_MIN` minutos (padrão 10) e pelo botão **Conferir agora**, a API compara a posição que os robôs registram (derivada das execuções) com o saldo real da Binance, **livre + bloqueado** (o ativo preso num stop da corretora continua sendo seu). Papel não tem o que conferir.

- **Só falta conta.** Saldo a mais é normal (moedas suas fora dos robôs, saldo inicial da testnet). Dois robôs do mesmo ativo somam a posição.
- **Tolerância:** 0,5% da posição (a Binance cobra a taxa da compra no próprio ativo quando você não paga com BNB) ou US$ 1 de poeira, o que for maior.
- **Com falta:** abre uma divergência, **pausa as compras daquele ativo** (barreira `divergencia_saldo`) e avisa. **Nada é comprado nem vendido para corrigir.**
- **Se o saldo voltar** (uma ordem que estava em andamento, por exemplo), a próxima conferência fecha a divergência sozinha.
- **Investigar:** na Binance, veja o histórico de ordens e negociações do ativo (venda manual?), saques, conversão de poeira e transferências. Compare com **Ordens** no ZenTrade.
- **Aceitar saldo da corretora** (reautenticação): a API confere de novo e, se ainda faltar, grava uma **baixa contábil** na posição dos robôs — uma venda registrada ao preço médio, sem taxa e sem ordem na corretora, então o resultado não muda. Use só depois de entender a diferença.

A reconciliação usa a mesma chave de leitura da carteira, o disjuntor da Binance e para a rodada no primeiro sinal de limite (429/418).

## Orçamento de IA

Em **Risco → Orçamento de IA**, cada pessoa define um teto mensal (e, se quiser, diário) em US$ para o que a IA gasta: análises dos robôs e respostas do assistente, nos dois provedores. O agente confere **antes** de chamar o modelo e grava o gasto de cada chamada (tabela `gastos_ia`). Mês e dia são os do fuso da instância (`ZENTRADE_FUSO`, padrão horário de Brasília). No Claude Code do seu plano, o custo é a estimativa que o próprio CLI informa.

- **No teto:** a análise volta como `aguardar` com o motivo "orçamento de IA do mês atingido" e o modelo nem é chamado; o assistente responde que parou e por quê.
- **Robôs:** com `MOTOR_AGENTE_OBRIGATORIO=true`, sem orçamento é como agente fora do ar: **compras param**; stops seguem (o stop nunca pergunta ao agente). Com o agente opcional, o robô segue sem a análise.
- **Avisos** em 80% e 100% (uma vez por mês, ou por dia no teto diário).
- Se o banco não responder na conferência, o agente não gasta (na dúvida, não chama o modelo).

## Assistente e o Claude Code (o seu plano)

O analista dos robôs e o **Assistente** (o chat em Acompanhar → Assistente) podem responder por dois "cérebros", escolhidos por pessoa em **Assistente → Configurações**:

| Provedor                  | Como funciona                                                                     | Precisa de                                                                                |
| ------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Claude pela API           | O SDK da Anthropic, pago por uso. O custo de cada análise fica na decisão.        | `ANTHROPIC_API_KEY` no agente                                                             |
| Claude Code (o seu plano) | O agente roda `claude -p` com o Claude da pessoa, dentro do limite do plano dela. | O CLI no agente e, de cada pessoa, o Claude conectado pela tela (ou um login no servidor) |

Nos dois casos o analista **só propõe** (a saída é a `PropostaAgente`, validada; fora do esquema vira "aguardar") e as ferramentas são **só de leitura**. No Claude Code, as ferramentas nativas ficam desligadas (`--tools ""`, `--restricted`, nada de Bash, Edit, Write ou WebFetch), as configurações do usuário são ignoradas e só a ponte MCP do ZenTrade é liberada; o ambiente do processo não leva `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` nem os segredos do ZenTrade. Quem nunca escolheu fica com a API, se o agente tiver a chave, senão com o Claude Code.

> **Termos de uso.** Usar o Claude Code pelo plano (Pro, Max, Team…) segue os termos da Anthropic: o plano é **pessoal**, para a própria pessoa usar. Cada pessoa conecta a **própria** conta; não use o plano de alguém para atender outras pessoas. Para uso por várias pessoas ou automatizado em escala, use a API.

### Conectar o Claude pela tela (o jeito recomendado)

Ninguém precisa abrir terminal. Cada pessoa, em **Assistente → Configurações** (ou **Contas e chaves**, ou o passo "Conectar a IA" do **Comece aqui**), no painel **Claude Code (seu plano)**:

1. **Conectar:** clica em **Conectar meu Claude** (pede 2FA ligado e a confirmação de identidade, como cadastrar chave de dinheiro real). O agente roda o `claude setup-token` oficial num pseudo-terminal e devolve o link de autorização.
2. **Autorizar no Claude:** **Abrir autorização no Claude** abre a página da Anthropic numa aba nova; a pessoa entra com a conta dela (Pro ou Max) e autoriza.
3. **Colar o código:** o Claude mostra um código; a pessoa cola na tela e conclui. O agente pega o token que o CLI imprime (vale 1 ano, só faz chamadas ao modelo) e o grava **cifrado** em `credenciais_claude`; a tela mostra só o final (`…abcd`), a validade e o último teste.

Depois disso, o provedor passa a ser "Claude Code (seu token)", e **Testar** faz uma chamada mínima para conferir. A conexão vale 10 minutos e cada pessoa pode começar 5 por hora. Quem preferir pode rodar `claude setup-token` no próprio computador e colar o token em **Avançado: já tenho um token**.

**O que o servidor precisa** (a imagem Docker já traz tudo):

- O Claude Code e o `script` do util-linux no agente (`util-linux-misc` no Alpine; o `script` é o pseudo-terminal, sem módulo nativo).
- **`ZENTRADE_CHAVE_MESTRA` também no agente**, a mesma da API: é com ela que o agente cifra o token na conexão e o decifra ao rodar o CLI. O `infra/docker-compose.yml` já passa a variável; sem ela, o agente sobe, mas o painel diz que o servidor não usa o Claude de cada pessoa.

**Ordem de precedência no agente**, a cada análise ou resposta da pessoa:

1. O token que **ela** conectou: o CLI roda com `CLAUDE_CODE_OAUTH_TOKEN` e um `CLAUDE_CONFIG_DIR` novo e vazio, só daquela execução (apagado no fim). `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` saem do ambiente: elas passariam na frente do token. Não usamos `--bare` (ele não lê o token).
2. Sem token, a pasta de login da conta escolhida (`AGENTE_CLAUDE_CONTAS`), como antes (veja abaixo).

Se o token expirar ou for revogado, o analista falha com uma mensagem clara (o robô não opera naquele sinal), o assistente diz "reconecte o seu Claude" e o painel mostra o erro com **Reconectar**. Se a chave mestra mudar, os tokens não abrem: cada pessoa reconecta (o agente não cai para a conta do servidor sem avisar).

### Alternativa: login feito no servidor (Docker)

Para quem opera sozinho e prefere o login do Claude Code no próprio servidor. A imagem do agente já traz o `claude` (repositório apk assinado da Anthropic, canal stable). O login fica no volume `claude-contas`, montado em `/dados/claude`, e sobrevive à troca do container. Cada conta é uma pasta (`CLAUDE_CONFIG_DIR`). Vale só para quem **não** conectou o próprio Claude pela tela:

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

Instale o Claude Code na máquina do agente (`curl -fsSL https://claude.ai/install.sh | bash`), confira que o `script` (util-linux) existe e dê ao agente a mesma `ZENTRADE_CHAVE_MESTRA` da API: cada pessoa conecta o Claude pela tela. Para o login no servidor, faça o login com `claude` e deixe `AGENTE_CLAUDE_CONTAS` vazio para usar o login padrão (`~/.claude`) do usuário que roda o agente — ou aponte contas para outras pastas, como acima. `AGENTE_CLAUDE_CAMINHO` diz onde está o executável (padrão: `claude` no `PATH`).

### Tetos e passos ao vivo

- `AGENTE_CLI_MAX_TURNOS` (padrão 8) e `AGENTE_CLI_TETO_USD` (padrão 1) limitam cada execução do Claude Code (`--max-turns` e `--max-budget-usd`); `AGENTE_TIMEOUT_MS` é o prazo da análise e `AGENTE_CHAT_TIMEOUT_MS` o de uma resposta do chat.
- Com `REDIS_URL` no agente, cada ferramenta consultada numa análise aparece ao vivo na tela (evento `analise` em `zentrade:eventos`, ligado ao `analiseId` do pedido do motor), nos dois provedores.
- A API precisa de `AGENTE_URL` e `AGENTE_SEGREDO` para o assistente; sem elas, as rotas do assistente respondem 503 e o resto segue normal.

## Privacidade e buscadores

**Política de privacidade.** Fica em `/privacidade`, sem login, e num diálogo no rodapé do login e da casca. Preencha o controlador antes de abrir a instância para outras pessoas: `ZENTRADE_CONTROLADOR_NOME` e `ZENTRADE_CONTROLADOR_EMAIL` (e, se houver, `ZENTRADE_ENCARREGADO_*`) no ambiente da API. Sem isso, a política mostra um aviso para quem opera. O passo a passo, o que a política promete e o que ainda falta estão em [privacidade.md](privacidade.md).

**Indexação: privada por padrão.** Cada instância é de alguém, e a página de login de uma instância privada não deve aparecer no Google. Por isso o build padrão:

- manda `<meta name="robots" content="noindex, nofollow">` em todas as rotas;
- serve um `robots.txt` com `Disallow: /`;
- faz o nginx mandar `X-Robots-Tag: noindex, nofollow` em toda resposta.

**Demonstração ou apresentação pública.** Para um endereço que deve aparecer em buscador, construa a tela com:

```bash
VITE_PUBLICO=1 VITE_URL_PUBLICA=https://demo.exemplo.org VITE_DEMO=1 \
  docker compose --env-file .env -f infra/docker-compose.yml --profile app build web
# sem Docker: VITE_PUBLICO=1 VITE_URL_PUBLICA=https://demo.exemplo.org corepack pnpm --filter @zentrade/web build
```

Com `VITE_PUBLICO=1`:

- só as páginas públicas (`/entrar` e `/privacidade`) recebem `index, follow`, URL canônica e `hreflang` pt-BR; as telas de quem entrou continuam `noindex`;
- o `robots.txt` libera essas páginas, fecha `/api/` e aponta o `sitemap.xml`, que lista só elas;
- a imagem social (`og.png` e `og.webp`, 1200×630) e o JSON-LD (`SoftwareApplication`, `SoftwareSourceCode` e `WebSite`) usam o endereço absoluto;
- o `web.Dockerfile` tira o `X-Robots-Tag` do nginx.

`VITE_PUBLICO=1` sem `VITE_URL_PUBLICA` faz o build falhar de propósito: sem endereço não há canônico nem sitemap. `VITE_DEMO=1` é opcional; com ele, o login vira a porta da demonstração, com dados fictícios e sem API.

O `llms.txt` (em `apps/web/public/` e na raiz do repositório) resume o projeto para buscadores com IA. Os dois são iguais, e um teste confere isso.

## Dados da B3 (mini índice)

Os candles do mini índice para o backtest não vêm da Binance: são importados para a tabela `candles` por dois comandos do motor, `importar-candles-b3` (Ibovespa intradiário pela brapi, gravado como `WIN-IBOV`; exige `BRAPI_TOKEN` de um plano com intradiário) e `importar-candles-csv` (o WIN exportado do MetaTrader 5, ou um CSV genérico). Uso, opções, Docker, fontes avaliadas e limites em [dados-b3.md](dados-b3.md).

```bash
corepack pnpm --filter "@zentrade/motor..." build
corepack pnpm --filter @zentrade/motor importar-candles-csv -- --simbolo WIN --intervalo 5m --arquivo WIN_M5.csv
```

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
