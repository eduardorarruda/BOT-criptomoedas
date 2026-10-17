# Como validar uma estratégia: fora da amostra, walk-forward e Sharpe deflacionado

Resumo: os passos para separar uma estratégia com indício de vantagem de uma que só se ajustou ao passado, e as métricas que o ZenTrade usa para isso.

Informação de outubro de 2026. Não é recomendação de investimento.

## O problema

Com dados suficientes e tentativas suficientes, sempre aparece uma estratégia que "funcionou" no passado. Quanto mais variações se testam, maior a chance de o melhor resultado ser sorte. Isso se chama **sobreajuste (overfitting) de backtest**.

## Passo a passo

1. **Escreva a hipótese antes de olhar os dados.** Por que a vantagem existiria e quem paga por ela.
2. **Registre cada variação testada** (o número N). Sem N, não dá para corrigir o resultado pela quantidade de tentativas.
3. **Backtest com custos reais.** No WIN: tarifas da B3, slippage (mais alto na abertura e em notícias), zeragem no fim do dia e rolagem de contrato com regra explícita.
4. **Sem olhar o futuro.** Uma decisão só pode usar dados disponíveis no momento dela. Cuidado com o candle que ainda não fechou e com a ordem dos eventos dentro do candle (stop e alvo no mesmo candle).
5. **Separe dentro e fora da amostra.** Otimize numa parte, teste em outra que o processo nunca viu.
6. **Walk-forward:** repita o passo anterior em janelas que andam no tempo (otimiza em janeiro a junho, testa em julho; otimiza em fevereiro a julho, testa em agosto; e assim por diante). Junte só os pedaços de teste.
7. **Corrija pelo número de tentativas:** use o Sharpe deflacionado (abaixo).
8. **Papel com dados ao vivo** antes de dinheiro real. O backtest nunca substitui essa etapa.
9. **Pouco dinheiro real**, com critérios de desligamento escritos antes.

## Métricas

| Métrica                  | O que mede                                        | Atenção                                 |
| ------------------------ | ------------------------------------------------- | --------------------------------------- |
| Resultado líquido        | Ganho depois de custos                            | Mostrar antes e depois do IR estimado   |
| Profit factor            | Soma dos ganhos ÷ soma das perdas                 | Abaixo de 1 perde dinheiro              |
| Expectativa por operação | Média do resultado por operação                   | Comparar com o custo por operação       |
| Taxa de acerto e payoff  | Frequência de ganho e tamanho médio ganho ÷ perda | Uma só não diz nada; as duas juntas sim |
| Queda máxima e duração   | Pior sequência do pico ao vale                    | É o que a pessoa vai sentir             |
| Sharpe                   | Retorno ÷ volatilidade                            | Inflado por muitas tentativas           |
| Número de operações      | Tamanho da amostra                                | Poucas operações não provam nada        |

## Sharpe deflacionado e probabilidade de sobreajuste

- O **Sharpe deflacionado** (Bailey e López de Prado) corrige o Sharpe observado pelo número de tentativas, pela assimetria e caudas dos retornos e pelo tamanho da amostra. O resultado é a probabilidade de o Sharpe verdadeiro ser positivo. Uma régua comum é exigir 0,95 ou mais.
- A **probabilidade de sobreajuste de backtest** (Bailey, Borwein, López de Prado e Zhu) estima, por validação cruzada combinatória, com que frequência a melhor configuração dentro da amostra fica abaixo da mediana fora dela.

## Calibração de probabilidades (quando um modelo dá a chance de acerto)

Se um modelo (estatístico ou de IA) diz "70% de chance", é preciso conferir:

- **Curva de confiabilidade:** agrupe as previsões por faixa (0,6 a 0,7, 0,7 a 0,8...) e compare com a frequência real de acerto em cada faixa. Bem calibrado fica perto da diagonal.
- **Brier score:** erro quadrático médio entre a probabilidade e o resultado (0 ou 1). Menor é melhor, mas mistura calibração com capacidade de separar casos; compare sempre com uma linha de base.
- **ECE** (erro de calibração esperado): a distância média entre previsão e frequência real, ponderada pelo número de casos em cada faixa.
- Se estiver descalibrado, dá para recalibrar com os próprios dados (regressão logística sobre a saída, chamada de Platt, ou regressão isotônica, que precisa de mais dados).

## Critérios de exemplo (a fixar antes de testar)

- Profit factor fora da amostra, depois de custos, ≥ 1,3.
- Pelo menos 300 operações fora da amostra.
- Sharpe deflacionado com probabilidade ≥ 0,95.
- Continua positivo com 1 tick a mais de slippage por perna e sem o melhor mês.

## Fonte(s)

- Bailey e López de Prado — [The Deflated Sharpe Ratio](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)
- Bailey, Borwein, López de Prado e Zhu — [The Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf)
- scikit-learn — [Probability calibration](https://scikit-learn.org/stable/modules/calibration.html)
- ZenTrade — [`docs/fundamentacao.md`](../../docs/fundamentacao.md) e [`docs/estrategias.md`](../../docs/estrategias.md)
