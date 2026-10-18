# Tarifas da Binance no mercado à vista (spot)

Resumo: quanto a Binance cobra por negociação à vista, o desconto pagando com BNB, os níveis VIP e quanto custa uma ida e volta.

Informação de outubro de 2026 (páginas oficiais consultadas em 17/10/2026). Não é recomendação de investimento.

## Taxa padrão

- **Nível regular (sem VIP):** 0,100% para quem adiciona liquidez (maker) e 0,100% para quem a retira (taker).
- **Maker** é a ordem que fica no livro esperando (limitada fora do preço). **Taker** é a que executa na hora contra o livro (a mercado, ou limitada que cruza o preço). Um stop que dispara vira, na prática, ordem taker.
- A taxa é cobrada **em cada negociação executada**: na compra e na venda. Ela sai na moeda que se recebe (comprou BTC com USDT, paga em BTC; vendeu, paga em USDT).
- O valor de taxa estimado na tela de negociação é só referência; o cobrado de verdade aparece no histórico de negociações.

## Desconto pagando com BNB

- Quem paga a taxa com BNB tem **25% de desconto**. No nível regular, 0,100% vira 0,075% por lado.
- Exige manter saldo de BNB e ativar a opção na conta. O BNB gasto é outra moeda que oscila de preço.

## Níveis VIP

- A taxa cai em níveis (VIP 1 a VIP 9) conforme o volume negociado e o saldo de BNB, pelos critérios publicados na própria página de tarifas.
- Em linhas gerais: no VIP 1 e no VIP 2 só a taxa maker cai (0,090% e 0,080%) e a taker continua em 0,100%. Do VIP 3 em diante as duas caem, chegando a 0,011% maker e 0,023% taker no VIP 9.
- Os volumes exigidos estão muito acima do que uma pessoa física opera. Para estudo e backtest de varejo, o número de referência é o do nível regular.

## Ida e volta

Uma operação completa paga taxa duas vezes. Com taxa `t` por lado e alvo calculado sobre o preço de entrada, o custo de ida e volta é `(1 + t) ÷ (1 − t) − 1`, um pouco acima de `2t`:

| Taxa por lado        | Ida e volta |
| -------------------- | ----------- |
| 0,100% (regular)     | ≈ 0,200%    |
| 0,075% (com BNB)     | ≈ 0,150%    |
| 0,023% (taker VIP 9) | ≈ 0,046%    |

## Exemplo: operação de US$ 1.000 no nível regular

| Componente                                        | Custo        |
| ------------------------------------------------- | ------------ |
| Taxa na compra (0,1% de US$ 1.000)                | US$ 1,00     |
| Taxa na venda (0,1% de cerca de US$ 1.000)        | US$ 1,00     |
| **Só taxas**                                      | **US$ 2,00** |
| Deslizamento + meio spread, hipótese de 7 pb/lado | US$ 1,40     |
| **Total com a hipótese de deslizamento**          | **US$ 3,40** |

Ou seja: só para empatar, o preço precisa andar cerca de 0,2% a favor; com a hipótese de deslizamento, cerca de 0,34%.

## Spread e deslizamento

- A Binance não publica número de spread nem de deslizamento: dependem do par, da hora, do tamanho da ordem e da volatilidade.
- Ordem a mercado cruza o livro e paga, no mínimo, metade do spread. Em pares líquidos (BTC/USDT, ETH/USDT) isso costuma ser pequeno; em pares pouco negociados e em momentos de notícia, pode passar da própria taxa.
- Hipótese usual para começar: alguns pontos-base (pb; 1 pb = 0,01%) por execução. O backtest do ZenTrade usa por padrão 5 pb de deslizamento + 2 pb de meio spread por execução. O número real só sai medindo as próprias ordens.

## Testnet

- A testnet de spot usa saldos fictícios, é reiniciada sem aviso (cerca de uma vez por mês) e tem livro e liquidez que não refletem o mercado real.
- Um moderador do fórum de desenvolvedores da Binance afirmou que a testnet não cobra comissão (resposta de 2021). Resultado na testnet, portanto, sai sem taxa: desconte a ida e volta antes de comparar com a conta real.

## Fonte(s)

- Binance — [Fee schedule (tabela de tarifas, spot)](https://www.binance.com/en/fee/schedule) (consultada em 17/10/2026)
- Binance — [Binance Spot Trading Fee Rate (FAQ, atualizada em 6/1/2026)](https://www.binance.com/en/support/faq/binance-spot-trading-fee-rate-e85d6e703b874674840122196b89780a) (consultada em 17/10/2026)
- Binance Spot Testnet — [General Info](https://developers.binance.com/docs/binance-spot-api-docs/testnet/general-info) (consultada em 17/10/2026)
- Binance Developer Community — [Commission fees using Test API](https://dev.binance.vision/t/commission-fees-using-test-api/3690) (resposta de moderador, 2021)
