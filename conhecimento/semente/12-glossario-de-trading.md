# Glossário de termos de trading

Resumo: definições curtas dos termos usados no ZenTrade e no day trade de mini índice.

Informação de outubro de 2026. Não é recomendação de investimento.

## Mercado e contrato

- **Ajuste (preço de ajuste):** preço de referência diário calculado pela B3 para contratos futuros; base para margem e limites do dia seguinte.
- **B3:** a bolsa brasileira.
- **Contrato futuro:** acordo de comprar ou vender um ativo numa data futura por um preço de hoje. No WIN, a liquidação é em dinheiro.
- **Day trade:** abrir e fechar a posição no mesmo pregão.
- **IND / WIN:** contrato futuro de Ibovespa cheio / mini.
- **Ponto:** unidade de preço do WIN. Vale R$ 0,20 por contrato.
- **Rolagem:** trocar o contrato que vence pelo seguinte.
- **Tick:** a menor variação de preço. No WIN, 5 pontos (R$ 1,00).
- **Vencimento:** data em que o contrato deixa de existir. No WIN, quarta-feira mais próxima do dia 15 dos meses pares.

## Pregão

- **Call / leilão:** período em que as ofertas se acumulam e os negócios saem a preço único. Acontece na abertura, no fechamento e quando o preço sai da faixa permitida.
- **Circuit breaker:** suspensão de toda a negociação quando o Ibovespa cai 10%, 15% ou 20%.
- **Limite de oscilação:** variação máxima permitida no dia em relação ao ajuste anterior.
- **Livro de ofertas:** lista de ordens de compra e venda esperando execução, por preço.
- **Pré-abertura:** minutos antes do pregão em que ofertas entram sem gerar negócio.
- **Túnel (de rejeição, de leilão):** faixas de preço dinâmicas; fora delas, a oferta é recusada ou o negócio vira leilão.

## Ordens

- **Ordem a mercado:** executa ao melhor preço disponível, qualquer que seja.
- **Ordem limitada:** executa só no preço indicado ou melhor.
- **Stop (stop loss):** ordem que dispara quando o preço atinge um nível, para limitar a perda.
- **Stop limitado (stop-limit):** ao disparar, vira ordem limitada; pode não executar num salto.
- **OCO (one cancels other):** duas ordens ligadas; quando uma executa, a outra é cancelada.
- **Slippage:** diferença entre o preço esperado e o executado.
- **Zeragem:** fechar toda a posição.

## Custos e impostos

- **Corretagem:** taxa da corretora por ordem ou contrato.
- **DARF 6015:** documento e código para pagar o imposto de day trade.
- **Emolumentos e tarifa de registro:** tarifas da B3 por contrato negociado.
- **IRRF ("dedo-duro"):** 1% retido na fonte sobre o resultado positivo do dia em day trade.
- **Margem de garantia:** valor bloqueado pela corretora para permitir a operação. Não é o limite de perda.
- **RLP (Retail Liquidity Provider):** a corretora pode ser contraparte das ordens de varejo.

## Risco

- **Exposição:** valor total controlado pela posição (no WIN, pontos × R$ 0,20 × contratos).
- **Parada total (kill switch):** botão que barra novas entradas; o stop continua podendo sair.
- **Perda máxima diária:** limite que, atingido, faz o robô parar de abrir posição no dia.
- **Queda máxima (drawdown):** maior perda do pico ao vale no período.
- **Tamanho por risco:** número de contratos calculado pela perda no stop, não pela margem.

## Validação e estatística

- **Backtest:** simulação da estratégia em dados passados.
- **Brier score:** erro quadrático médio entre probabilidades previstas e resultados; menor é melhor.
- **Calibração:** quanto as probabilidades de um modelo batem com a frequência real.
- **Curva de confiabilidade:** gráfico que compara probabilidade prevista e frequência observada, por faixa.
- **Dentro / fora da amostra:** dados usados para ajustar / dados nunca vistos no ajuste.
- **ECE:** erro de calibração esperado; distância média entre previsão e frequência real.
- **Expectativa:** resultado médio por operação.
- **Overfitting (sobreajuste):** estratégia ajustada ao ruído do passado, que não se repete.
- **Payoff:** ganho médio ÷ perda média.
- **Profit factor:** soma dos ganhos ÷ soma das perdas.
- **Sharpe:** retorno ÷ volatilidade. **Sharpe deflacionado:** corrigido pelo número de tentativas e pela forma dos retornos.
- **Walk-forward:** otimizar numa janela, testar na seguinte, e repetir andando no tempo.

## IA no ZenTrade

- **Analista:** a IA que recebe o sinal e devolve uma proposta (agir ou aguardar). Não envia ordem.
- **Jev:** modelo da TypeSafe que responde perguntas fechadas com probabilidades.
- **Linha de base:** modelo simples (por exemplo, regressão logística) usado como régua para saber se uma IA acrescenta algo.
- **RAG:** busca em documentos da pessoa para dar contexto à IA.
- **`state`:** o contexto enviado ao Jev a cada chamada.

## Fonte(s)

- B3 — [Futuro Mini de Ibovespa](https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-variavel/futuro-mini-de-ibovespa.htm)
- B3 — [Metodologia de cálculo de túneis de negociação](https://www.b3.com.br/data/files/B7/04/ED/E1/87A7061099BE5706790D8AA8/Metodologia-de-Calculo-de-Tuneis-de-Negociacao.pdf)
- Receita Federal — [Cálculo e pagamento do imposto](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/bolsa-de-valores-1/calculo-e-pagamento-do-imposto)
- scikit-learn — [Probability calibration](https://scikit-learn.org/stable/modules/calibration.html)
- TypeSafe docs — [Primitives](https://docs.typesafe.ai/primitives)
