# Notas de partida da base de conhecimento

Notas curtas, escritas para o ZenTrade, para importar na base de conhecimento (RAG) de uma pessoa. O assistente e o analista de IA podem citá-las como fonte. Cada nota tem título, resumo de uma linha, data da informação (outubro de 2026) e links das fontes no fim. Nenhuma é recomendação de investimento.

O estudo completo que deu origem a elas está em [`docs/mini-indice-e-jev.md`](../../docs/mini-indice-e-jev.md).

| Nota                                                                                   | Assunto                                                                    |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [01-mini-indice-win.md](01-mini-indice-win.md)                                         | Especificação do WIN: ponto, tick, código, vencimento, rolagem, margem     |
| [02-horarios-e-leiloes-b3.md](02-horarios-e-leiloes-b3.md)                             | Horários do WIN, leilões, túneis de preço e circuit breaker                |
| [03-custos-e-impostos-day-trade.md](03-custos-e-impostos-day-trade.md)                 | Tarifas da B3, corretora, slippage e imposto de renda do day trade         |
| [04-gestao-de-risco-day-trade.md](04-gestao-de-risco-day-trade.md)                     | Tamanho pela perda no stop, limites de perda, riscos que o backtest não vê |
| [05-evidencias-day-trade-e-robos-brasil.md](05-evidencias-day-trade-e-robos-brasil.md) | Estudo da FGV, posição da CVM, testes com modelos de linguagem             |
| [06-familias-de-estrategia.md](06-familias-de-estrategia.md)                           | Tendência, reversão, fluxo, eventos, filtros de regime                     |
| [07-como-validar-uma-estrategia.md](07-como-validar-uma-estrategia.md)                 | Fora da amostra, walk-forward, Sharpe deflacionado, calibração             |
| [08-modelo-de-seguranca-zentrade.md](08-modelo-de-seguranca-zentrade.md)               | Regras decidem, IA argumenta, risco tem a palavra final                    |
| [09-jev-o-que-e-e-uso-seguro.md](09-jev-o-que-e-e-uso-seguro.md)                       | O que o Jev é, o que faz mal e como usar num robô                          |
| [10-plataformas-para-automatizar-win.md](10-plataformas-para-automatizar-win.md)       | Profit, ProfitDLL, MetaTrader 5 e APIs de terceiros                        |
| [11-regulacao-de-robos-no-brasil.md](11-regulacao-de-robos-no-brasil.md)               | Uso próprio, oferta a terceiros, exigências de corretoras                  |
| [12-glossario-de-trading.md](12-glossario-de-trading.md)                               | Termos usados no ZenTrade e no day trade de mini índice                    |

## Como importar

Com o comando de importação do ZenTrade (em construção), apontando para o e-mail da pessoa dona da base:

```sh
importar-conhecimento --email pessoa@exemplo.com --pasta conhecimento/semente
```

Confira o nome exato do comando e onde ele roda em [`docs/operacao.md`](../../docs/operacao.md) quando ele for publicado.

## Manutenção

- As notas envelhecem: horários da B3, tarifas, margens e o próprio Jev mudam. Revise a data e as fontes antes de confiar num número.
- Ao atualizar uma nota, mantenha o texto original (sem copiar trechos longos de fontes), o resumo de uma linha e a seção "Fonte(s)".
- Nota nova segue o mesmo formato e entra nesta tabela.
