# Cofre de tendência: segura acima da SMA 400, caixa abaixo (22/10/2026)

Pré-registro em `cofre-tendencia.mjs` (uma tentativa): 4h, SMA 400, uma decisão por dia (fechamento das 00:00 UTC), comprado acima e em caixa abaixo, à vista (0,1%/lado + 7 pb), capital todo dentro ou todo fora. Resultado de teste, não recomendação.

```
par   | desde   | cofre: retorno  pior queda | comprar e segurar: retorno  pior queda | trocas  tempo investido
ADA   | 2019-03 |    2019%    -84% |     473%    -95% |  147   43%
ATOM  | 2019-07 |      31%    -83% |     -68%    -97% |  155   42%
AVAX  | 2020-11 |    2082%    -76% |     207%    -96% |  111   42%
BCH   | 2020-02 |     -51%    -90% |     -19%    -94% |  171   45%
BNB   | 2019-03 |    5700%    -66% |    5344%    -78% |  127   57%
BTC   | 2019-03 |    2290%    -62% |    2040%    -77% |  135   56%
DOGE  | 2019-09 |    6964%    -91% |    3778%    -93% |  139   44%
DOT   | 2020-10 |     223%    -80% |     -72%    -99% |  105   36%
ETC   | 2019-03 |     730%    -79% |     106%    -96% |  141   43%
ETH   | 2019-03 |    2921%    -59% |    1857%    -81% |  123   56%
LINK  | 2019-03 |     402%    -88% |    3052%    -90% |  185   53%
LTC   | 2019-03 |      87%    -90% |      19%    -90% |  163   49%
SOL   | 2020-10 |    7671%    -77% |    5390%    -97% |  123   49%
TRX   | 2019-03 |     129%    -77% |    1382%    -79% |  172   59%
XRP   | 2019-03 |      -4%    -91% |     378%    -84% |  171   46%

CARTEIRA (15 pares, peso igual, de 2021-01 a hoje): cofre 1348% com pior queda -67% | comprar e segurar 886% com pior queda -87%
  2021: cofre  1026% | comprar e segurar  1414%
  2022: cofre   -42% | comprar e segurar   -81%
  2023: cofre   150% | comprar e segurar   190%
  2024: cofre     3% | comprar e segurar   100%
  2025: cofre   -19% | comprar e segurar   -36%
  2026: cofre     5% | comprar e segurar    -9%
```

**Conclusão:** na carteira das 15 moedas (2021→hoje), +1.348% com pior queda de −67%, contra +886% e −87% de comprar e segurar. Corta as quedas pela metade (2022: −42% contra −81%; 2025: −19% contra −36%) e fica atrás nas altas fortes (2021, 2023, 2024). Melhor que segurar em 10 de 15 moedas. Limites: quedas por moeda ainda grandes (−59% a −91%), ~20 trocas por ano, viés de sobrevivência (moedas escolhidas hoje), uma janela só.
