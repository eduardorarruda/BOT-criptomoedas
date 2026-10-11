# Carteira da Binance

A tela **Carteira** mostra tudo o que a pessoa tem na Binance: quanto investiu, quanto vale hoje, quanto rendeu e quanto pagou de taxa, separando o que o robô negociou do que ela negociou à mão. Só fatos e números do passado: nada aqui é previsão nem recomendação.

Uma chave **só de leitura** basta para a carteira. Para os robôs operarem, a mesma chave precisa de permissão de negociação — e nunca de saque.

## De onde vêm os números

1. **Sincronização** (`POST /api/v1/carteira/sincronizar`, sob demanda, e a cada `CARTEIRA_SINCRONIZAR_MIN` minutos para toda pessoa com conta cadastrada):
   - saldos de `/api/v3/account` (a foto inteira é trocada a cada vez);
   - negociações de `/api/v3/myTrades`, par a par, paginando por `fromId` (1000 por página) e começando depois do último id já importado;
   - a origem de cada negociação pelo `clientOrderId` da ordem (`/api/v3/allOrders`): **robô** quando começa com `zt-` (o id que o motor manda), **manual** nos demais casos;
   - a cotação e a taxa em USDT **do instante** da negociação (ver abaixo).
2. **Leitura** (`GET /api/v1/carteira`): o cálculo é feito na hora, a partir do que está no banco e dos preços atuais (`/api/v3/ticker/price`, em cache por 10 s).

A importação é idempotente: a chave única é (pessoa, rede, par, id da negociação). Sincronizar duas vezes não duplica nada. Se a Binance responder 429 no meio, o que já entrou fica e a sincronização sai como **parcial**; a próxima continua de onde parou. Antes de cada chamada o cliente confere o peso usado no minuto (`X-MBX-USED-WEIGHT-1M`) e, perto de 4800 (80% do limite de 6000), espera o minuto virar.

**Quais pares.** A Binance só lista negociações por par. Entram: cada moeda do saldo com as cotações comuns (USDT, FDUSD, USDC, BRL, BTC, ETH, BNB, EUR, TRY) que existam no `exchangeInfo`, os pares já vistos antes, os pares dos robôs da pessoa e os que ela pedir no corpo (`{ "simbolos": ["XYZUSDT"] }`). Limitação conhecida: uma moeda que a pessoa **zerou antes da primeira sincronização** e em par fora dessa lista não aparece sozinha — peça o par em `simbolos`.

## Método de custo: preço médio ponderado

O mesmo da posição do domínio (`packages/dominio/src/posicao.ts`), por moeda:

- **Compra:** soma `quantidade × preço` ao custo da posição. O preço médio é `custo ÷ quantidade`.
- **Venda:** tira do custo a fração vendida (`custo × vendido ÷ quantidade`) e realiza a diferença para o preço de venda: `resultado realizado bruto += vendido × preço de venda − custo que saiu`. Ao zerar, o custo vai a zero exato e a próxima compra começa um preço médio novo.
- **Realizado bruto** não desconta taxas. **Realizado líquido** = bruto − **todas** as taxas pagas (de compra e de venda), como no domínio.
- **Não realizado** = quantidade em posição × preço atual − custo da posição.
- **Resultado líquido** = realizado líquido + não realizado; **retorno** = resultado líquido ÷ custo de tudo o que foi comprado.
- **Alocação** = saldo × preço atual ÷ valor da conta (todas as moedas com preço, inclusive USDT).

Tudo em decimal exato (`dec()`), nunca ponto flutuante. Valores saem como texto com até 18 casas; frações com 10.

### Taxas

A taxa de cada negociação é convertida para USDT no instante em que aconteceu:

| Taxa paga em     | Valor em USDT                                                      |
| ---------------- | ------------------------------------------------------------------ |
| USDT             | ela mesma                                                          |
| moeda base       | taxa × preço da negociação × cotação em USDT                       |
| moeda de cotação | taxa × cotação em USDT                                             |
| outra (ex.: BNB) | taxa × preço dessa moeda em USDT na vela de 1 minuto da negociação |

Taxa na base de uma compra sai do que se recebe (a quantidade em posição é a líquida); na venda, sai junto com o vendido. BNB gasto em taxa sai do BNB pelo custo médio, sem resultado próprio (o valor já entrou como taxa da outra negociação). Sem preço para converter, a taxa fica **sem conversão** (null) e a tela avisa que o total de taxas está incompleto — nunca vira zero.

### Pares sem USDT

Comprar ETH com BTC (ETHBTC) é comprar ETH **e vender BTC**: as duas pernas entram, cada uma na sua moeda, ao preço em USDT do instante (cotação do BTC na vela de 1 minuto). Pares com USDT na base (USDTBRL) mexem só na outra moeda. USDT é a referência: aparece como **caixa**, sem preço médio nem resultado.

## O que não se sabe aparece como não sabido

- **Saldo sem negociação** (depósito, transferência, airdrop): a diferença entre o saldo e a quantidade explicada pelas negociações aparece como **custo desconhecido**. Entra no valor da conta, nunca no preço médio, no investido nem no resultado.
- **Negociações somam mais que o saldo** (saque, Earn, transferência para fora): a diferença aparece como "fora do saldo"; o resultado considera a posição das negociações.
- **Venda além do que foi comprado** nas negociações conhecidas: o excedente não tem custo e fica fora do resultado realizado.
- **Moeda sem par com USDT**: sem preço, fica fora do valor da conta e da alocação, com aviso.
- **Negociação sem cotação em USDT no instante**: fica fora do cálculo e é contada (`semConversao`).

## Robô × manual × total

Cada parcela tem o **próprio** preço médio: o livro do robô só vê as negociações do robô; o manual, só as manuais; o total, todas. Por isso a soma das parcelas pode diferir do total quando uma vende o que a outra comprou (a tela avisa). Quantidades, custos comprados, valores vendidos e taxas somam exatamente.

## Credenciais por pessoa

A chave fica cifrada em envelope (AES-256-GCM) em `contas_corretora`. A API e o motor a decifram com `ZENTRADE_CHAVE_MESTRA` pela `PortaCredenciais` (`packages/banco/src/portas/credenciais.ts`). No motor, cada robô liga com uma `BinanceCorretora` da pessoa dona dele (uma por pessoa e rede, nova se a chave mudar). `BINANCE_API_KEY`/`BINANCE_API_SECRET` do ambiente só valem com `ZENTRADE_AMBIENTE=desenvolvimento`, para quem ainda não cadastrou a própria chave. O motor continua sem rede real (`MOTOR_REDE` aceita `papel` ou `testnet`); dinheiro real segue o portão da API (2FA + reautenticação).

## Status da conta

`GET /api/v1/binance/status` (só sessão) diz, por conta cadastrada, se a Binance aceitou a chave, se ela pode negociar e — só na rede real, por `/sapi/v1/account/apiRestrictions` — se pode **sacar** e se está presa a um IP. Chave com saque ou sem IP aparece em destaque na tela. A testnet não tem `/sapi`: lá as permissões ficam desconhecidas.
