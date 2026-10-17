# Custos e impostos do day trade de mini índice

Resumo: quanto custa cada operação de WIN (tarifas da B3, corretora, slippage) e como funciona o imposto de renda do day trade.

Informação de outubro de 2026. Não é parecer tributário nem recomendação de investimento.

## Tarifas da B3

A B3 cobra uma **tarifa única** por contrato, dividida em emolumentos (35%) e tarifa de registro (o resto). Para a família Ibovespa, a conta é:

1. **Tarifa única da faixa**, progressiva pelo volume médio diário do mês (ADV): R$ 1,97 de 1 a 50 contratos, caindo até R$ 1,07 acima de 15.000.
2. **Fator contrato:** 0,2 para o WIN. Então, na primeira faixa: 1,97 × 0,2 ≈ R$ 0,39 por contrato.
3. **Redução para day trade**, progressiva pelo ADV de day trade: 35% (1 a 5), 40% (6 a 50), 55% (51 a 150), 70% (151 a 1.500), 75% (acima).

Para quem opera pouco: cerca de **R$ 0,25 por contrato em cada execução**, ou **R$ 0,50 por ida e volta**. O material educativo da B3 cita custo máximo de R$ 0,50 para o WIN. A nota de corretagem do primeiro mês é o número que vale.

## Corretora e plataforma

- Muitas corretoras zeram a corretagem de minicontratos e cobram por plataforma, dados ou exigem contrapartidas (volume mínimo, RLP ativo).
- **RLP** (Retail Liquidity Provider): a corretora pode ser a contraparte das suas ordens de varejo.
- Plataformas como o Profit têm planos de R$ 0 (com condições) a algumas centenas de reais por mês; a automação em conta real costuma ser um módulo pago à parte.
- Onde houver corretagem, incide ISS municipal sobre ela.

## Slippage

Slippage é a diferença entre o preço esperado e o executado. Não há número publicado para o WIN; é preciso medir. Hipóteses usuais para começar:

- 1 tick (R$ 1,00) por perna em ordem a mercado ou stop em condição normal;
- vários ticks na abertura e em divulgações de alta importância.

## Exemplo de custo por operação (hipóteses explícitas)

| Componente                 | Ida e volta, 1 contrato | Em pontos |
| -------------------------- | ----------------------- | --------- |
| Tarifas B3                 | R$ 0,50                 | 2,5       |
| Slippage, 1 tick por perna | R$ 2,00                 | 10        |
| **Total**                  | **R$ 2,50**             | **12,5**  |

Num alvo de 50 pontos (R$ 10), o custo leva 25% do ganho bruto. Por isso, estratégias com alvo pequeno exigem taxa de acerto alta só para empatar.

## Imposto de renda do day trade

- **Alíquota:** 20% sobre o **ganho líquido do mês** em day trade.
- **IRRF ("dedo-duro"):** 1% sobre o resultado líquido positivo de cada dia, retido na fonte. Pode ser abatido do imposto devido no mês ou nos meses seguintes, **até dezembro do mesmo ano**; o saldo que sobrar pode ser pedido de volta na declaração anual.
- **Pagamento:** a própria pessoa calcula e paga por **DARF, código 6015**, até o último dia útil do mês seguinte.
- **Prejuízo:** perda em day trade só compensa ganho em day trade, em meses seguintes, sem prazo. Não se mistura com operações comuns.
- **Proposta que não vingou:** a MP 1.303/2025 mudaria a alíquota para 17,5% com apuração trimestral, mas caducou em 8/10/2025. A regra de 20% segue em 2026.

## Efeitos que costumam surpreender

- O imposto incide sobre o ganho de cada mês, mas a perda só abate ganho futuro. Alternar meses bons e ruins faz pagar imposto antes de recuperar.
- O IRRF de 1% é cobrado mesmo em meses que fecham no prejuízo (se algum dia teve resultado positivo) e só é recuperado com ganho futuro no mesmo ano ou na declaração.
- Custos e imposto juntos podem transformar um resultado bruto pequeno e positivo em resultado líquido negativo.

## Fonte(s)

- B3 — [Tarifação: regras de cálculo e tabelas de preços, v4.2](https://b3.com.br/data/files/9C/66/74/7E/2E40B9105B12E5A9AC094EA8/Tarifacao_V4.2_PT.pdf)
- B3 — [Tarifas de Ibovespa e Índice Brasil 50](https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/listados-a-vista-e-derivativos/renda-variavel/tarifas-de-ibovespa-e-indice-brasil-50/futuros-e-estruturadas/)
- Bora Investir/B3 — [Características dos principais produtos de day trade](https://borainvestir.b3.com.br/tipos-de-investimentos/renda-variavel/day-trade/conheca-as-caracteristicas-dos-principais-produtos-de-day-trade/)
- Nova Futura — [Profit: versões e condições](https://www.novafutura.com.br/profit)
- Receita Federal — [Cálculo e pagamento do imposto](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/bolsa-de-valores-1/calculo-e-pagamento-do-imposto)
- Receita Federal — [Retenções](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/bolsa-de-valores-1/retencoes)
- InfoMoney — [MP 1.303 cai no Congresso](https://www.infomoney.com.br/minhas-financas/mp-1-303-cai-no-congresso-veja-como-fica-a-tributacao-dos-investimentos-agora/)
- IN RFB 1.585/2015, arts. 64 e 65 (só busca) — [Imprensa Nacional](https://www.in.gov.br/materia/-/asset_publisher/Kujrw0TZC2Mb/content/id/32827203/do1-2015-09-02-instrucao-normativa-n-1-585-de-31-de-agosto-de-2015-32827199)
