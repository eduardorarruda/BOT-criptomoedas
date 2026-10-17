# Gestão de risco no day trade

Resumo: como se define o tamanho da posição pelo risco, por que o stop vem antes da entrada e quais limites de perda costumam existir num robô.

Informação de outubro de 2026. Os números são exemplos de cálculo, não recomendação de investimento.

## Tamanho pela perda no stop, não pela margem

A margem mínima de day trade do WIN (R$ 155 por contrato) diz quanto a corretora bloqueia, não quanto se pode perder. O tamanho da posição se calcula assim:

1. Defina a perda máxima por operação em reais (exemplo: R$ 50).
2. Defina a distância do stop em pontos (exemplo: 150 pontos).
3. Perda por contrato no stop = pontos × R$ 0,20 + custos. Exemplo: 150 × 0,20 = R$ 30, mais cerca de R$ 2,50 de custos = R$ 32,50.
4. Contratos = perda máxima ÷ perda por contrato, arredondado **para baixo**. Exemplo: 50 ÷ 32,50 = 1,5, logo 1 contrato.

Se o resultado for zero, a operação não cabe no risco e não deve ser feita.

## O stop

- O stop é definido **antes** da entrada e fica registrado onde sobrevive à queda do robô (no servidor da corretora ou da plataforma, ou no livro da bolsa).
- Stop não garante preço. Num salto, num leilão ou num circuit breaker, a execução pode sair bem pior que o preço do stop, ou não sair.
- Stop limitado protege contra execução muito ruim, mas pode ficar para trás e não executar. Stop a mercado executa, mas a qualquer preço.
- Em OCO (stop e alvo juntos), se as duas pernas ficam no livro e o cancelamento da segunda falha, a perna que sobra pode **abrir uma posição nova no sentido contrário**. Robôs costumam deixar só o stop no livro e fazer a saída no alvo por conta própria.

## Limites que costumam existir

| Limite             | O que faz                      | Exemplo de regra                                                 |
| ------------------ | ------------------------------ | ---------------------------------------------------------------- |
| Perda por operação | Fixa o tamanho máximo          | Até X reais por operação                                         |
| Perda do dia       | Para de abrir posição no dia   | Atingiu Y reais negativos, só zera e para                        |
| Perda do mês       | Pausa a estratégia             | Atingiu Z reais negativos, volta para papel                      |
| Operações por dia  | Evita excesso de giro          | No máximo N entradas                                             |
| Stops seguidos     | Pausa depois de sequência ruim | 3 stops seguidos, pausa até o dia seguinte                       |
| Horário            | Evita janelas de pior execução | Sem entrada nos primeiros minutos nem perto de evento importante |
| Zeragem            | Não carrega posição            | Zera tudo minutos antes do fechamento                            |
| Parada total       | Botão que barra novas entradas | O stop continua podendo sair                                     |

Os limites valem mais quando são **determinísticos**: escritos no código, conferidos antes de cada ordem, e fora do alcance de qualquer IA.

## Risco que o backtest não mostra

- **Dado atrasado ou parado:** o robô pensa que o preço é um e o mercado está em outro.
- **Ordem incerta:** a ordem saiu, mas a confirmação não chegou. Reenviar sem conferir pode dobrar a posição.
- **Divergência de posição:** o robô acha que está zerado e a corretora não. Reconciliar a posição com a corretora é parte da gestão de risco.
- **Plataforma ou ponte fora do ar:** sem conexão, o robô não deve abrir posição; o que já está no livro continua lá.

## Kelly e alavancagem

O critério de Kelly calcula a fração "ótima" do capital por aposta, mas supõe conhecer a vantagem exata, o que nunca acontece. Usá-lo cheio leva a quedas grandes; quando usado, costuma ser uma fração pequena dele. Em day trade de WIN, com vantagem incerta ou inexistente, a regra prática é fixar a perda por operação numa fração pequena do capital.

## Fonte(s)

- B3 — [Margem mínima requerida para minicontratos](https://www.b3.com.br/pt_br/solucoes/plataformas/puma-trading-system/para-participantes-e-traders/regras-e-parametros-de-negociacao/margem-minima-requerida-e-guia-educacional-para-minicontratos/)
- Bora Investir/B3 — [Robô trader: limites de perda e plataforma homologada](https://borainvestir.b3.com.br/noticias/robo-trader-veja-como-automatizar-os-investimentos-no-day-trade/)
- Bora Investir/B3 — [Circuit breaker](https://borainvestir.b3.com.br/noticias/mercado/entenda-o-que-e-e-como-funciona-o-circuit-breaker/)
- B3 — [Metodologia de cálculo de túneis de negociação](https://www.b3.com.br/data/files/B7/04/ED/E1/87A7061099BE5706790D8AA8/Metodologia-de-Calculo-de-Tuneis-de-Negociacao.pdf)
- MacLean, Thorp e Ziemba — Good and Bad Properties of the Kelly Criterion (citado em [`docs/fundamentacao.md`](../../docs/fundamentacao.md))
