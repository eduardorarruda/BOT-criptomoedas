# Operação

Como colocar o ZenTrade de pé e conduzir um robô da observação até o modo automático, com segurança. Leia também [segurança](seguranca.md) e [estratégias](estrategias.md).

> **Estado do projeto.** Os serviços (`apps/api`, `apps/motor`, `apps/agente`, `apps/web`) e o `docker-compose` ainda estão em construção. Os passos abaixo seguem o [contrato entre os serviços](contrato-api.md); onde um comando depende de algo que ainda não existe, isso está marcado como **pendente**.

## Subir o ambiente

Requisitos: Node 24, Docker e um servidor (ou máquina) com IP fixo, se for usar dinheiro real.

```bash
git clone <repositório> zentrade && cd zentrade
corepack pnpm install
cp .env.example .env        # preencha; o .env nunca vai para o git
corepack pnpm check         # lint, tipos e testes
```

Segredos que você gera (cada um com `openssl rand -hex 32`, guardados num gerenciador de senhas):

| Variável              | Para quê                                                     |
| --------------------- | ------------------------------------------------------------ |
| `N8N_WEBHOOK_SEGREDO` | assinatura dos webhooks entre a API e o n8n (32+ caracteres) |
| `AGENTE_SEGREDO`      | autenticação do motor no agente de IA                        |

Serviços e portas em desenvolvimento: API `8080`, agente `8081` (só rede interna), tela `5173`, PostgreSQL `55432`, Redis `56379`, n8n `5678`. **Pendente:** o `docker-compose` que sobe tudo junto.

Confira a saúde: `GET /api/v1/saude` responde `{ ok, servicos: { banco, redis, motor, agente } }` sem precisar de login.

## Criar o primeiro usuário

**Pendente:** o comando de criação do primeiro usuário será definido em `apps/api`. Depois de criado:

1. Entre pela tela (`POST /api/v1/sessao` por trás).
2. Ligue o **2FA** logo no primeiro acesso.
3. Crie os tokens de que vai precisar (tela → Tokens): um de **leitura** e um de **operar** para o n8n. O token aparece uma vez só; cole direto na credencial do n8n.

## Conectar a testnet

1. Crie uma conta em <https://testnet.binance.vision> e gere uma chave de API (o saldo é fictício).
2. No `.env`, deixe `BINANCE_REDE=testnet`.
3. Na tela, cadastre a conta da corretora (rede `testnet`, chave e segredo). A tela pede sua senha ou código 2FA de novo (reautenticação), e depois só mostra o final da chave (`…a1b2`).

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

A parada total barra **todas** as ordens de todos os robôs. O motor a lê a cada decisão.

- **Ligar:** botão na tela, ou
  ```bash
  curl -X POST "$ZENTRADE_API_URL/api/v1/parada-total" \
    -H "Authorization: Bearer $ZT_TOKEN_OPERAR" -H "content-type: application/json" \
    -d '{ "ligada": true }'
  ```
- **Automática:** o fluxo `zentrade-vigia-saude` liga sozinho se o motor ficar mais de 3 minutos sem dar sinal, e avisa no Telegram.
- **Desligar:** só pela tela, com reautenticação. De propósito: quem desliga precisa ser uma pessoa olhando o que aconteceu.

Ligue sem medo quando tiver dúvida. O custo é perder oportunidades; posições abertas continuam na corretora e você pode encerrá-las pela própria Binance.

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

| Sintoma                                | O que fazer                                                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aviso "motor sem sinal" no Telegram    | A parada total já foi ligada. Veja os logs do motor e `GET /api/v1/saude`. Com o motor de volta, confira posições e decisões e só então desligue a parada pela tela. |
| Aviso "API não respondeu"              | O vigia não consegue ligar a parada por ela. Entre no servidor; se precisar, pare o motor (`docker stop`) — sem motor, nenhuma ordem sai.                            |
| Decisões sem proposta da IA            | O agente caiu, demorou mais de 60 s ou respondeu fora do esquema. O robô não opera nesses casos. Veja os logs do agente e o custo de IA no relatório.                |
| Ordem rejeitada pela corretora         | O motivo fica na ordem (`GET /api/v1/ordens`). Comum: filtros de lote ou valor mínimo mudaram, saldo insuficiente, chave sem permissão de negociar.                  |
| Posição na tela diferente da corretora | A posição é calculada das execuções confirmadas. Procure ordem pendente ou parcial; o motor reconcilia pelo `idCliente`. Não "corrija" a posição na mão.             |
| Perda diária atingida                  | Compras param até o dia seguinte; vendas que encerram posição continuam. Use a pausa para revisar a estratégia antes de mexer nos limites.                           |
| Webhook do n8n devolvendo 401          | O segredo da credencial do n8n não é o mesmo de `N8N_WEBHOOK_SEGREDO`, ou o relógio de um dos servidores está errado (a assinatura vale 5 min).                      |
| Telegram não recebe nada               | Confira a credencial do bot, `TELEGRAM_CHAT_ID` e se você mandou mensagem ao bot antes. Veja as execuções com erro no n8n.                                           |
| O n8n caiu                             | O núcleo segue. Propostas em `sugerir` expiram sem resposta; alertas e relatório atrasam. Suba o n8n de novo.                                                        |
| Suspeita de chave vazada               | Ligue a parada total, **apague a chave na Binance**, remova a conta-corretora na tela, gere uma nova (sem saque, com IP) e troque os segredos do `.env`.             |
| Suspeita de token vazado               | Revogue na tela (Tokens) e crie outro. Se for o do n8n, atualize a credencial.                                                                                       |
