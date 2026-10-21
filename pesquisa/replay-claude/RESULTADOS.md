# Replay do Claude sobre a P1 — p1-donchian-20-10-sma200

Gerado em 2026-10-21. Janela dos sinais: 2026-07-01 a 2026-10-20. Dados até 2026-10-21T20:00:00.000Z. Pares: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, ADAUSDT, DOGEUSDT, LINKUSDT, AVAXUSDT, LTCUSDT.

## Veredito

**O Claude é INDISTINGUÍVEL DO ACASO: o resultado das entradas que ele aprovou ficou entre o p5 e o p95 do filtro aleatório de mesma taxa de aprovação.**

Resultado das aprovações: US$ +758,56; acaso (1000 rodadas, 117 entradas sorteadas): média US$ +1008,67, p5 US$ +237,36, p95 US$ +1692,49; o acaso igualou ou superou o Claude em 70,1% das rodadas.
Contra a regra pura (entrar em todos): -969,04 US$ (regra + Claude menos regra pura).

## Comparação

|                                            | Regra pura (todos) | Regra + Claude (aprovados) | Aleatório (117 sorteados, média) |
| ------------------------------------------ | -----------------: | -------------------------: | -------------------------------: |
| Entradas                                   |                200 |                        117 |                              117 |
| Acerto (lucro > 0)                         |              33,0% |                      31,6% |                            33,1% |
| Ganho médio (%)                            |              +5,50 |                      +5,29 |                                — |
| Perda média (%)                            |              -1,42 |                      -1,50 |                                — |
| Média por operação (%)                     |              +0,86 |                      +0,65 |                            +0,86 |
| Resultado líquido somado (%)               |            +172,64 |                     +75,80 |                          +100,80 |
| Resultado líquido (US$, 1000 por operação) |           +1727,60 |                    +758,56 |                         +1008,67 |

## Precisão do Claude

- Aprovações certas (a entrada deu lucro líquido): 31,6% (37/117; Wilson 95%: 23,9% a 40,5%).
- Vetos certos (a entrada vetada teria dado prejuízo ou zero): 65,1% (54/83; Wilson 95%: 54,3% a 74,4%).
- Taxa de aprovação: 58,5%.
- As entradas que ele vetou somariam US$ +969,04 (83 sinais; acerto 34,9%).

## Contagens e custo

- Sinais da P1 na janela: 303. Analisados pelo Claude: 200. Sobraram sem análise (passaram do máximo): 103.
- Entram na comparação (desfecho da regra pura resolvido): 200. Ficaram de fora por posição ainda aberta nos dados: 0.
- Custo gasto com o agente nesta rodada: US$ 5,23.

## Como foi medido

- Estratégia P1: Donchian 20/10 (modelo `donchian-20-10`) com a regra extra preço > SMA(200) na entrada; uma posição por vez em cada par (um sinal novo só depois da saída da regra pura).
- Cada sinal foi enviado ao agente com as velas só até o fechamento do candle do sinal e o instante dele como "agora"; o histórico de decisões e a base de conhecimento ficam desligados no replay (nada posterior ao sinal pode entrar).
- Aprovou = a proposta final do agente é comprar, com a regra dos cenários aprovada (valor esperado > 0, cenário favorável no limiar) e sem veto grave. O resto é veto.
- Desfecho de cada sinal: o mesmo para quem foi aprovado e para quem foi vetado. Entrada na abertura do candle seguinte, com deslizamento e meio spread (7 pontos-base por lado) e taxa de 0,1% por lado; saída pelo stop (2 ATR, teto 10%), alvo, regra de saída do Donchian ou horizonte de 500 candles, avaliada candle a candle (stop e alvo no mesmo candle contam o stop).
- Mesmo tamanho em toda operação (US$ 1000), para somar dinheiro. O acaso sorteia, sem repetição, tantas entradas quanto o Claude aprovou (semente fixa).
- Regra do veredito, fixada antes dos resultados: acima do p95 do acaso = agrega; abaixo do p5 = tira; entre os dois = indistinguível.

## Limites

- Uma janela só (julho a outubro de 2026), uma estratégia e um modelo: o veredito vale para este recorte, não para qualquer mercado.
- Sinais de um mesmo dia em vários pares são correlacionados (o mercado cripto anda junto): a amostra efetiva é menor que o número de sinais.
- O replay não tem orçamento de risco, saldo nem exposição: o agente analisa sem eles, como se a conta estivesse zerada.
- A regra pura anda um sinal por vez; entradas que o Claude veta não mudam os sinais seguintes (o mesmo conjunto é avaliado nas duas pontas).
- Candles da Binance real pública, em cache; entrada exata na abertura seguinte, sem fila nem liquidez limitada.
- O Claude Code CLI do usuário roda com as ferramentas de mercado do pedido; sem acesso a notícias do período.
