# Automações do ZenTrade no n8n

Seis fluxos que ficam **fora do núcleo** (veja o [ADR 006](../../docs/adr/006-n8n-fora-do-nucleo.md)): avisam, buscam notícias, pedem aprovação e vigiam a saúde. Nenhum deles envia ordem. Se o n8n cair, o robô continua sob as regras do motor de risco; o que se perde é aviso e conveniência.

Testados com o **n8n 2.42.6** (imagem oficial `docker.n8n.io/n8nio/n8n`). Usam só nós padrão.

| Fluxo                          | Quando                            | O que faz                                                                                                                                                  |
| ------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zentrade-noticias`            | a cada 15 min                     | Lê os anúncios da Binance e os feeds RSS, monta um resumo curto com link e envia para `POST /webhooks/n8n/conhecimento` (assinado).                        |
| `zentrade-aprovacao`           | `POST /webhook/zentrade-proposta` | Confere a assinatura, manda a proposta no Telegram com **Aprovar/Recusar**, espera até 5 min e devolve a resposta assinada para `/webhooks/n8n/aprovacao`. |
| `zentrade-alertas`             | `POST /webhook/zentrade-alerta`   | Confere a assinatura, descarta o mesmo fato repetido em 10 min e repassa o alerta para o Telegram (e para o e-mail, se configurado). Ver a seção 6.      |
| `zentrade-relatorio-diario`    | todo dia às 21h (Brasília)        | Busca `GET /api/v1/resumo`, `/decisoes` e `/ordens` e envia o relatório: resultado, decisões, taxas e custo de IA.                                         |
| `zentrade-vigia-saude`         | a cada minuto                     | Chama `POST /webhooks/n8n/saude`. Se o motor está sem sinal há mais de 3 min, liga a parada total e avisa.                                                 |
| `zentrade-revalidacao-semanal` | domingo às 8h (Brasília)          | Dispara backtests das estratégias dos robôs ativos (últimos 30 dias × 90 dias anteriores) e envia a comparação.                                            |

## 1. Variáveis de ambiente do n8n

Configure no contêiner do n8n (no `docker-compose`, por exemplo). **Nenhuma delas é segredo**: tokens e chaves vão em credenciais (seção 3).

| Variável                       | Obrigatória | Exemplo                       | Para quê                                                                                                      |
| ------------------------------ | ----------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | sim         | `false`                       | Desde a versão 2.0 o n8n bloqueia `$env` nas expressões. Os fluxos leem as variáveis abaixo por `$env`.       |
| `GENERIC_TIMEZONE`             | sim         | `America/Sao_Paulo`           | Fuso padrão. Os fluxos também fixam `America/Sao_Paulo` nas próprias configurações.                           |
| `ZENTRADE_API_URL`             | sim         | `http://api:8080`             | Endereço da API vista de dentro do n8n, **sem barra no final**.                                               |
| `TELEGRAM_CHAT_ID`             | sim         | `123456789`                   | Conversa que recebe alertas, relatórios e pedidos de aprovação.                                               |
| `TELEGRAM_APROVADORES_IDS`     | recomendada | `123456789`                   | IDs de usuário do Telegram que podem aprovar, separados por vírgula. Vazio = qualquer um que veja a mensagem. |
| `WEBHOOK_URL`                  | recomendada | `https://n8n.seudominio.com/` | Endereço público do n8n. Com HTTPS público, a aprovação é feita com um toque dentro do chat.                  |
| `ZENTRADE_FEEDS_RSS`           | não         | `https://site.com/rss`        | Feeds RSS extras (só `https://`), separados por vírgula. Os padrões são Cointelegraph e Decrypt.              |
| `ZENTRADE_ALERTA_EMAIL`        | não         | `voce@exemplo.com`            | Se preenchida, os alertas também vão por e-mail (precisa da credencial SMTP).                                 |
| `ZENTRADE_ALERTA_EMAIL_DE`     | não         | `zentrade@exemplo.com`        | Remetente dos e-mails de alerta.                                                                              |

Sobre `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`: ela deixa qualquer pessoa que edite fluxos ler as variáveis de ambiente do n8n. Num n8n de uma pessoa só isso não muda nada (quem edita fluxos já pode usar as credenciais). **Não dê acesso de edição do seu n8n a mais ninguém.**

## 2. Criar o bot do Telegram

1. No Telegram, abra uma conversa com **@BotFather** e mande `/newbot`. Escolha um nome e um usuário terminado em `bot`.
2. O BotFather responde com o **token do bot**. Guarde-o só na credencial do n8n (passo 3). Se ele vazar, use `/revoke` no BotFather.
3. Mande qualquer mensagem para o seu bot (ele só fala com quem falou com ele antes).
4. Descubra o seu **ID de usuário**: mande uma mensagem para **@userinfobot**. Numa conversa privada com o bot, o ID do chat é o mesmo ID de usuário. Use-o em `TELEGRAM_CHAT_ID` e em `TELEGRAM_APROVADORES_IDS`.
5. Se preferir um grupo, adicione o bot ao grupo; o ID do grupo é negativo (ex.: `-1001234567890`). Num grupo, preencha `TELEGRAM_APROVADORES_IDS`, senão qualquer membro aprova.

## 3. Credenciais

Crie as credenciais no n8n (**Credentials → Add credential**) **antes de importar**, com estes nomes exatos. Na importação, o n8n liga cada nó à credencial de mesmo nome e tipo; se o nome não bater, abra o nó e escolha a credencial na mão.

| Nome da credencial                 | Tipo no n8n         | O que preencher                                                                                                                                        |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ZenTrade assinatura dos webhooks` | **Crypto**          | Campo **Hmac Secret**: o mesmo valor de `N8N_WEBHOOK_SEGREDO` da API (32+ caracteres; gere com `openssl rand -hex 32`). Os outros campos ficam vazios. |
| `ZenTrade token leitura`           | **Header Auth**     | Name: `Authorization`. Value: `Bearer ` seguido de um token de escopo **leitura** criado na tela do ZenTrade (Tokens).                                 |
| `ZenTrade token operar`            | **Header Auth**     | Name: `Authorization`. Value: `Bearer ` seguido de um token de escopo **operar**. É usado só para ligar a parada total e disparar backtests.           |
| `ZenTrade Telegram`                | **Telegram API**    | Access Token: o token do BotFather.                                                                                                                    |
| `ZenTrade SMTP`                    | **SMTP** (opcional) | Servidor, porta, usuário e senha do seu provedor de e-mail. Só é necessária se `ZENTRADE_ALERTA_EMAIL` estiver preenchida.                             |

O segredo do HMAC nunca aparece nos fluxos: o nó **Crypto** calcula a assinatura lendo a credencial, que o n8n guarda cifrada com a `N8N_ENCRYPTION_KEY` dele. Faça backup dessa chave; sem ela as credenciais não abrem.

## 4. Importar e ligar

Pela tela: **Workflows → Import from File**, um arquivo de `infra/n8n/fluxos/` por vez. Depois abra cada fluxo e **publique** (botão de ativar/publicar no canto superior direito).

Pela linha de comando, com o n8n em Docker:

```bash
docker cp infra/n8n/fluxos zentrade-n8n:/tmp/fluxos
docker exec zentrade-n8n n8n import:workflow --separate --input=/tmp/fluxos
for id in ztNoticias000001 ztAprovacao00001 ztAlertas0000001 ztRelatorio00001 ztVigiaSaude0001 ztRevalidacao001; do
  docker exec zentrade-n8n n8n publish:workflow --id=$id
done
docker restart zentrade-n8n   # publicar pela linha de comando só vale depois de reiniciar
```

Os fluxos têm ids fixos: importar de novo **atualiza** o fluxo existente em vez de duplicar. Se você mudou algo pela tela, exporte antes (**Download**) para não perder.

Para atualizar o repositório depois de editar um fluxo no n8n: **Download** → substitua o arquivo em `infra/n8n/fluxos/` → rode `pnpm --filter @zentrade/n8n-validacao test`. Os testes acusam segredo colado por engano, caminho fora do contrato e HMAC divergente.

## 5. Como a aprovação funciona

1. A API cria uma decisão no modo **sugerir** e chama `POST /webhook/zentrade-proposta` com a `PropostaCriada` assinada.
2. O fluxo confere a assinatura (cabeçalho `X-ZenTrade-Assinatura`, HMAC-SHA256 de `"t.corpo"`, validade de 5 min, igual ao `verificar()` de `@zentrade/contratos`). Assinatura errada ou vencida: **401**. Corpo fora do contrato: **400**. Tudo certo: **202** na hora.
3. Manda a proposta no Telegram com **✅ Aprovar** e **❌ Recusar** e espera até 5 minutos (ou até `expiraEm`, se vier antes).
4. Com resposta, monta a `RespostaAprovacao` (`{ decisaoId, aprovada, porQuem }`), assina e envia para `POST /webhooks/n8n/aprovacao`. Depois confirma no chat.
5. **Sem resposta, não faz nada**: a decisão expira sozinha no motor. A proposta só chega ao Telegram depois de passar pelo motor de risco; aprovar não pula nenhuma regra.

Dois modos de botão, escolhidos pelo próprio n8n:

- **Um toque no chat**: quando o n8n está em HTTPS público (`WEBHOOK_URL`). O n8n registra o webhook do bot para receber o clique. Use um bot só para o ZenTrade: se o bot já tiver webhook de outro sistema, o nó recusa.
- **Link**: sem HTTPS público, cada botão abre uma página do n8n que registra a resposta. O celular precisa alcançar o n8n. Se não alcançar, aprove pela tela do ZenTrade.

Proposta repetida (mesmo `decisaoId`) dentro de 1 hora não gera segunda mensagem.

## 6. Testar cada fluxo

Antes de tudo: `pnpm build` na raiz (o script de teste usa `assinar()` compilado).

**Alertas**

```bash
N8N_URL=http://localhost:5678 N8N_WEBHOOK_SEGREDO='<o mesmo da credencial>' \
  node tools/n8n-validacao/src/enviar-teste.ts alerta
```

Esperado: `202 {"recebido":true}` e a mensagem no Telegram. Com o segredo errado, `401`.

**Aprovação**

```bash
N8N_URL=http://localhost:5678 N8N_WEBHOOK_SEGREDO='<o mesmo da credencial>' \
  node tools/n8n-validacao/src/enviar-teste.ts proposta
```

Esperado: `202 {"recebida":true}`, a proposta no Telegram com os dois botões e, depois do clique, a confirmação no chat. A decisão de teste não existe no motor, então a API deve recusar a resposta; o chat mostra isso.

**Notícias, relatório, revalidação**: abra o fluxo no n8n e clique em **Execute workflow**. Confira a saída de cada nó. Numa execução manual o n8n não grava os dados estáticos, então as notícias podem ser reenviadas; a API descarta repetidas (`hash_conteudo` único).

**Vigia de saúde**: com tudo de pé, a execução termina em "Avaliar saúde" sem saída (está tudo bem). Para ver o alarme, pare o motor (`docker stop zentrade-motor`) e espere 4 minutos: a parada total liga e o aviso chega. Ao religar o motor, chega o aviso de volta, mas a **parada total continua ligada** até você desligá-la pela tela.

## 6.1 Os alertas que chegam

A API manda ao `zentrade-alerta` um `Alerta` assinado: `{ tipo, titulo, mensagem, em, gravidade?, chave? }`. A lista completa, quem emite cada um e as janelas de deduplicação estão em [docs/alertas.md](../../docs/alertas.md). Em resumo:

| `tipo`                                         | Gravidade | Quando                                                                        |
| ---------------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| `stop_atingido`                                | atenção   | um robô vendeu a posição no stop                                              |
| `perda_diaria_robo` / `perda_diaria_conta`     | atenção / crítico | a perda do dia do robô (ou da conta) chegou ao limite                 |
| `pausa_sequencia_stops` / `pausa_queda`        | atenção / crítico | N stops em X horas, ou a queda do pico passou do limite: compras pausadas |
| `ordem_rejeitada` / `ordem_incerta`            | atenção / crítico | a corretora recusou a ordem, ou não se sabe se ela entrou             |
| `robo_nao_ligou`                               | crítico   | o robô não liga (chave recusada, rede errada...)                              |
| `websocket_fora`                               | crítico   | o WebSocket de candles está fora há mais de `MOTOR_ALERTA_WEBSOCKET_MIN`      |
| `divergencia_saldo`                            | crítico   | o saldo da Binance está abaixo do que os robôs registram                      |
| `orcamento_ia_80` / `orcamento_ia_100`         | atenção / crítico | o gasto com IA do mês (ou do dia) passou de 80% / chegou a 100%       |
| `parada_total`                                 | —         | a parada total foi ligada ou desligada                                        |

O fluxo põe `[CRÍTICO]` ou `[ATENÇÃO]` na frente do título e, se a mesma `chave` voltar dentro de 10 minutos, responde 202 mas não manda a segunda mensagem (a API já deduplica com janelas maiores; esta é a segunda rede). A memória dos repetidos usa os dados estáticos do fluxo, que o n8n só guarda nas execuções de produção (fluxo publicado).

O ZenTrade tem uma conversa só no Telegram (`TELEGRAM_CHAT_ID`): numa instalação com várias pessoas, todos os alertas vão para ela. Cada pessoa vê os próprios avisos na tela, em **Risco → Avisos**.

## 7. O que os fluxos não fazem

- Não enviam ordem nem mudam robôs. O máximo que fazem é **ligar** a parada total; desligar exige uma pessoa reautenticada na tela.
- Não guardam matéria de notícia: só título, um resumo de até 280 caracteres e o link.
- Não contornam o motor de risco: só propostas já aprovadas por ele chegam ao Telegram, e a API só aceita a resposta enquanto a decisão estiver valendo.

## Validação automática

```bash
pnpm --filter @zentrade/n8n-validacao test
```

Confere: estrutura de exportação do n8n e versões dos nós; ausência de segredos em claro; caminhos, métodos e cabeçalhos contra `docs/contrato-api.md`; e que a cadeia de HMAC dos fluxos (Code → Crypto → Code) dá o mesmo resultado que `assinar()`/`verificar()` de `@zentrade/contratos`, inclusive nos casos de borda.
