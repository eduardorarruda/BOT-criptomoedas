# Alertas

O ZenTrade avisa quando algo importante acontece com os robôs, a conta ou a IA. Cada alerta vira um **aviso na tela** (Risco → Avisos) e, pelo n8n, uma **mensagem no Telegram** (e e-mail, se configurado). Alerta é conveniência: se a API ou o n8n estiverem fora, o motor de risco continua decidindo do mesmo jeito.

## O que avisa

| Tipo                    | Gravidade | Quem percebe | Quando                                                                                                                            | Dedup (por pessoa)           |
| ----------------------- | --------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `stop_atingido`         | atenção   | API          | uma venda com motivo `stop` foi executada                                                                                         | uma vez por decisão          |
| `perda_diaria_robo`     | atenção   | API          | o motor barrou uma compra com `perda_diaria` (limite do robô)                                                                     | uma vez por robô e dia local |
| `perda_diaria_conta`    | crítico   | API          | o motor barrou uma compra com `conta_perda_diaria`                                                                                | uma vez por dia local        |
| `pausa_sequencia_stops` | atenção   | API          | barreira `sequencia_stops` (conta) ou `sequencia_stops_robo` (robô): StoplossGuard                                                | 6 h, por robô ou pela conta  |
| `pausa_queda`           | crítico   | API          | barreira `conta_queda`: a conta caiu mais que o limite desde o pico                                                               | 6 h                          |
| `ordem_rejeitada`       | atenção   | API          | a corretora recusou a ordem (evento `ordem` em `REJEITADA`)                                                                       | uma vez por ordem            |
| `ordem_incerta`         | crítico   | API          | o envio falhou sem resposta: não se sabe se a ordem entrou (`PENDENTE` com "Estado incerto")                                      | uma vez por ordem            |
| `robo_nao_ligou`        | crítico   | motor        | o robô não liga (chave recusada ou com saque, rede errada, sem chave)                                                             | 6 h por robô                 |
| `websocket_fora`        | crítico   | motor        | o WebSocket de candles está fora há mais de `MOTOR_ALERTA_WEBSOCKET_MIN` (padrão 5 min)                                           | uma vez por queda            |
| `divergencia_saldo`     | crítico   | API          | a reconciliação achou o saldo da Binance abaixo do que os robôs registram ([operação](operacao.md#reconciliação-com-a-corretora)) | uma vez por divergência      |
| `orcamento_ia_80`       | atenção   | agente       | o gasto com IA do mês (ou do dia) passou de 80% do teto                                                                           | uma vez por mês (ou dia)     |
| `orcamento_ia_100`      | crítico   | agente       | o gasto com IA chegou ao teto: análises voltam como "aguardar" e o assistente para                                                | uma vez por mês (ou dia)     |
| `parada_total`          | —         | API          | a parada total foi ligada ou desligada (só Telegram, não vira aviso)                                                              | —                            |

A mensagem de cada alerta diz o que aconteceu, o que o sistema já fez (ex.: "compras pausadas, vendas seguem") e o que a pessoa pode fazer.

## Como chega

1. **Quem percebe emite.** O motor e o agente publicam `{ tipo: "alerta", alerta }` no canal `zentrade:eventos` do Redis (`AlertaEmitido` em `@zentrade/contratos`: `tipo`, `gravidade`, `titulo`, `mensagem`, `chave`, `usuarioId?`, `roboId?`, `em`). A API transforma em alerta os eventos que já existem (`risco`, `ordem`, `decisao`) e os que ela mesma vê (reconciliação).
2. **A API acha a dona** pelo `usuarioId` ou pelo robô. Sem dona conhecida (robô apagado, usuário local do modo arquivo), o alerta é descartado com um aviso no log.
3. **Deduplica** com `SET NX` no Redis (`zentrade:alerta:<pessoa>:<chave>`), com a janela da tabela acima. A `chave` identifica o fato: a mesma barreira repetida a cada candle vira um aviso só.
4. **Grava o aviso** na tabela `avisos` (RLS por pessoa) e manda ao n8n (`POST /webhook/zentrade-alerta`, assinado com HMAC, como os outros webhooks).
5. **Teto por pessoa:** no máximo 10 mensagens ao Telegram a cada 15 minutos. O que passar fica só na tela (marcado "só na tela"). Alertas **críticos sempre vão**.
6. **O n8n** põe `[CRÍTICO]` ou `[ATENÇÃO]` no título e não repete a mesma `chave` em 10 minutos (segunda rede, caso a API seja reiniciada). Ver [infra/n8n](../infra/n8n/README.md#61-os-alertas-que-chegam).

Se o n8n estiver fora, o aviso fica na tela marcado como não enviado e o erro vai para o log da API. Não há reenvio automático.

## Na tela

**Risco → Avisos** lista os últimos alertas com a gravidade, quando chegaram e se ainda não foram lidos. "Marcar como lidos" vale para todos. A tela de Risco também se atualiza sozinha quando chega um alerta pelo WebSocket.

## Configuração

| Variável                         | Serviço | Padrão | Para quê                                                      |
| -------------------------------- | ------- | ------ | ------------------------------------------------------------- |
| `MOTOR_ALERTA_WEBSOCKET_MIN`     | motor   | `5`    | Minutos com o WebSocket de candles fora até virar alerta.     |
| `RECONCILIACAO_MIN`              | API     | `10`   | Intervalo da reconciliação com a Binance (0 = só pelo botão). |
| `N8N_URL`, `N8N_WEBHOOK_SEGREDO` | API     | —      | Para onde vão os alertas (os mesmos dos outros fluxos).       |

O destino no Telegram é um só (`TELEGRAM_CHAT_ID` no n8n): numa instalação com várias pessoas, todos os alertas vão para essa conversa; cada pessoa vê só os dela na tela.
