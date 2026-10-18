# Custo por operação no ZenTrade

Resumo: como o ZenTrade conta o custo de uma operação em cripto e no WIN, e por que o alvo dos modelos fica longe de propósito.

Informação de outubro de 2026. Não é recomendação de investimento nem parecer tributário.

## Cripto (Binance à vista)

- **Taxa por lado:** cada estratégia tem a sua. Os modelos de cripto usam 0,1%, a taxa do nível regular da Binance (nota 13).
- **Ida e volta:** `(1 + t) ÷ (1 − t) − 1`. Com `t` = 0,1%, dá cerca de 0,2%.
- **Alvo líquido:** o alvo da estratégia já é o lucro que sobra **depois** das duas taxas. O preço de saída é calculado para isso.
- **Deslizamento e spread:** hipótese em pontos-base (pb) por execução. O backtest usa por padrão 5 pb de deslizamento + 2 pb de meio spread. Com isso, a ida e volta passa para cerca de 0,34%.

## Mini índice (WIN)

| Componente                      | Hipótese padrão                       | Ida e volta, 1 contrato   |
| ------------------------------- | ------------------------------------- | ------------------------- |
| Tarifa da B3 (quem opera pouco) | ≈ R$ 0,25 por contrato por execução   | R$ 0,50                   |
| Corretagem                      | Zero (comum em minicontratos)         | R$ 0,00                   |
| Deslizamento                    | 1 tick (5 pontos = R$ 1,00) por perna | R$ 2,00                   |
| **Total**                       |                                       | **R$ 2,50 (12,5 pontos)** |

- Cada ponto vale R$ 0,20 por contrato (nota 01).
- O tamanho da posição sai da perda no stop **somada** à ida e volta: contratos = risco aceito ÷ (distância do stop × R$ 0,20 + custos).
- **Imposto (nota 03):** 20% sobre o ganho líquido do mês em day trade, mais IRRF de 1% sobre o resultado positivo de cada dia. Não é custo de cada operação: o backtest do WIN estima o imposto por mês, à parte.

## Custo em relação ao stop

A conta que mais importa é **distância do stop ÷ custo de ida e volta**: quantos "custos" cabem no risco de uma operação.

| Caso                             | Stop       | Ida e volta | Stop em custos            |
| -------------------------------- | ---------- | ----------- | ------------------------- |
| Cripto, stop de 5%               | 5%         | ≈ 0,34%     | ≈ 15 (25 só com as taxas) |
| Cripto, stop de 1%               | 1%         | ≈ 0,34%     | ≈ 3 (5 só com as taxas)   |
| WIN, stop de 0,3% (≈ 390 pontos) | 390 pontos | 12,5 pontos | ≈ 31                      |
| WIN, stop de 50 pontos           | 50 pontos  | 12,5 pontos | 4                         |

Com poucos custos de distância, a taxa come a operação: cada stop custa a perda mais um pedaço grande de custo, e cada ganho pequeno some quase inteiro. Estratégia de stop curto precisa de taxa de acerto alta só para empatar.

## Por que o alvo fica longe de propósito

- Nos modelos de tendência e rompimento, quem encerra a operação é a **regra de saída**, o **stop** ou o **tempo máximo**. O alvo fica longe para não cortar a tendência que paga as várias perdas pequenas.
- Um alvo perto demais faria o custo de ida e volta pesar em cada ganho, e a estratégia passaria a depender de acertar quase sempre.
- O "empate" (mover o stop para o preço em que as duas taxas ficam pagas e o resultado é zero) só é aceito com gatilho acima do custo de ida e volta: abaixo disso, o preço ainda nem cobriu as taxas.

## Fonte(s)

- Notas [01](01-mini-indice-win.md) (ponto e tick do WIN), [03](03-custos-e-impostos-day-trade.md) (tarifas da B3, deslizamento, imposto) e [13](13-taxas-binance-a-vista.md) (tarifas da Binance)
- Binance — [Fee schedule (tabela de tarifas, spot)](https://www.binance.com/en/fee/schedule) (consultada em 17/10/2026)
- B3 — [Tarifas de Ibovespa e Índice Brasil 50](https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/listados-a-vista-e-derivativos/renda-variavel/tarifas-de-ibovespa-e-indice-brasil-50/futuros-e-estruturadas/)
- B3 — [Futuro Mini de Ibovespa](https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-variavel/futuro-mini-de-ibovespa.htm)
- Receita Federal — [Cálculo e pagamento do imposto](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/bolsa-de-valores-1/calculo-e-pagamento-do-imposto)
- Receita Federal — [Retenções](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/bolsa-de-valores-1/retencoes)
