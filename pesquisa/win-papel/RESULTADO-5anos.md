# Mini índice (WIN) — 5 anos reais (nov/2021 a 22/10/2026)

Dados: WIN$N de 5 minutos tirado do MT5 da Rico (conta demo, XP), 138.689 velas; 15m e 1h montadas a partir delas. Cada robô começa com **R$ 10.000**, arrisca **R$ 300 por operação**, executa na abertura da vela seguinte e zera no fim do pregão (day trade). Custos: tarifa da B3 por contrato e 1 tick de deslizamento por lado. IR: 20% sobre o lucro do mês de day trade (estimado, com compensação de prejuízo). Os testes em 5m rodaram em 3 pedaços de ~20 meses (limite do backtest), cada um recomeçando com R$ 10.000; a soma é dos três.

Resultado de teste com dados passados, não recomendação de investimento.

## Ranking (líquido = depois das taxas, antes do IR)

|   # | Estratégia                  | Vela   | Operações | Certas | Erradas |  Acerto |  Bruto | Taxas B3 | Deslizamento | **Líquido** | IR estimado |    Pior queda |
| --: | --------------------------- | ------ | --------: | -----: | ------: | ------: | -----: | -------: | -----------: | ----------: | ----------: | ------------: |
|   1 | P1 Donchian + tendência     | 5m     |     1.432 |    538 |     894 |     38% | 37.843 |    2.521 |       11.088 |  **24.234** |       4.847 |           77% |
|   2 | P1 + filtro de horário      | 5m     |     1.139 |    462 |     677 |     41% | 34.305 |    2.037 |        8.917 |  **23.351** |       4.741 |           52% |
|   3 | Donchian com stop ATR       | 1h     |       649 |    266 |     383 |     41% | 24.171 |    1.066 |        4.880 |  **18.226** |       3.741 |           21% |
|   4 | P2 Donchian 55/20           | 5m     |       971 |    337 |     634 |     35% | 26.270 |    1.685 |        7.593 |  **16.992** |       3.788 |           48% |
|   5 | Donchian com stop ATR       | 15m    |     1.715 |    578 |   1.137 |     34% | 31.547 |    2.804 |       12.818 |  **15.925** |       5.455 |           34% |
|   6 | P1 + filtro de horário      | 15m    |       523 |    237 |     286 |     45% | 14.689 |      511 |        2.194 |  **11.984** |       2.559 |           19% |
|   7 | EMA 9/21 + ADX              | 1h     |       183 |     74 |     109 |     40% | 12.487 |      299 |        1.341 |  **10.847** |       2.410 |           11% |
|   8 | P2 Donchian 55/20           | 15m    |       452 |    191 |     261 |     42% | 12.220 |      430 |        1.888 |   **9.902** |       2.412 |           26% |
|   9 | P1 Donchian + tendência     | 15m    |       634 |    264 |     370 |     42% | 12.233 |      619 |        2.683 |   **8.932** |       2.304 |           35% |
|  10 | P3 MACD                     | 15m    |       637 |    261 |     376 |     41% | 10.811 |      617 |        2.537 |   **7.658** |       1.532 |           30% |
|  11 | **P0 Donchian**             | **1h** |       237 |    143 |      94 | **60%** |  7.295 |      122 |          499 |   **6.675** |       1.335 |        **7%** |
|  12 | Faixa de abertura           | 1h     |       990 |    509 |     481 |     51% |  8.684 |      495 |        2.089 |   **6.100** |       1.264 |           24% |
|  13 | **P1 Donchian + tendência** | **1h** |       193 |    118 |      75 | **61%** |  6.132 |       98 |          403 |   **5.631** |       1.126 |        **6%** |
|  14 | **P1 + filtro de horário**  | **1h** |       173 |    104 |      69 | **60%** |  5.710 |       87 |          357 |   **5.266** |       1.053 |        **6%** |
|  15 | **P2 Donchian 55/20**       | **1h** |       149 |     94 |      55 | **63%** |  4.788 |       76 |          312 |   **4.401** |         880 |        **6%** |
|  16 | P0 Donchian                 | 15m    |       816 |    333 |     483 |     41% |  8.468 |      790 |        3.448 |       4.231 |       1.543 |           34% |
|  17 | P3 MACD                     | 1h     |       127 |     69 |      58 |     54% |  3.995 |       65 |          259 |       3.672 |         771 |            7% |
|  18 | Faixa de abertura           | 15m    |     1.401 |    591 |     810 |     42% |  7.027 |      716 |        3.002 |       3.310 |         664 |           32% |
|  19 | P0 Donchian                 | 5m     |     1.388 |    503 |     885 |     36% | 13.766 |    2.545 |       11.165 |          56 |       2.087 | 99% (quebrou) |
|  20 | Bollinger volta à média     | 1h     |       224 |     75 |     149 |     33% |   −860 |      453 |        2.194 |      −3.507 |           0 |           73% |
|  21 | EMA 9/21 + ADX              | 15m    |       606 |    194 |     412 |     32% |    955 |      983 |        4.588 |      −4.616 |         182 |           83% |
|  22 | Faixa de abertura           | 5m     |     1.802 |    662 |   1.140 |     37% |  1.058 |    1.394 |        5.847 |      −6.183 |         399 |           65% |
|  23 | Bollinger volta à média     | 15m    |       298 |     96 |     202 |     32% | −5.730 |      709 |        3.411 |      −9.850 |           0 | 99% (quebrou) |
|  24 | Bollinger volta à média     | 5m     |     1.857 |    882 |     975 |     47% | 12.520 |    4.488 |       20.029 |     −11.997 |       1.613 | 99% (quebrou) |
|  25 | Donchian com stop ATR       | 5m     |     2.202 |    766 |   1.436 |     35% |  9.328 |    4.089 |       18.112 |     −12.873 |       2.869 | 99% (quebrou) |
|  26 | P3 MACD                     | 5m     |     1.757 |    547 |   1.210 |     31% | −2.602 |    3.184 |       13.173 |     −18.959 |       1.785 | 99% (quebrou) |
|  27 | EMA 9/21 + ADX              | 5m     |     1.243 |    376 |     867 |     30% | −6.250 |    2.342 |       10.987 |     −19.579 |         387 | 99% (quebrou) |

## O que os números dizem

- **Vela de 1h é a mais saudável.** P0, P1, P1 + horário e P2 em 1h ganharam em 5 anos com **60–63% de acerto** e **queda máxima de só 6–7%** do capital. Ganham menos em reais (R$ 4,4 mil a R$ 6,7 mil em 5 anos, ~R$ 900 a R$ 1.300 por ano sobre R$ 10 mil), mas sem sustos.
- **5m dá os maiores lucros e os maiores sustos.** P1 em 5m somou R$ 24 mil, mas chegou a perder 77% do capital no caminho; seis das nove estratégias em 5m quebraram a conta em algum pedaço. Taxas + deslizamento passam de R$ 10 mil em quase todas as de 5m.
- **Bollinger e EMA curta não servem para o WIN** em nenhum tempo gráfico (exceto EMA em 1h).
- Os dados vêm do contrato contínuo da corretora (WIN$N); as viradas de vencimento caem entre pregões e não afetam day trade.

## Próximo passo (em andamento)

Os 9 modelos × 3 tempos gráficos rodam no **pregão de papel** a partir de 23/10, 09:05, com as velas ao vivo do MT5 da Rico, em duas versões (sem Claude / com Claude). O relatório do dia sai em `pesquisa/win-papel/saida/<dia>.md`, atualizado a cada 5 minutos.
