# Pré-registro: filtro de aprendizado de máquina (Etapa 2)

Fixado em 2026-10-20, ANTES de gerar o dataset completo e de rodar qualquer modelo. Segue o protocolo de `docs/fundamentacao.md` (seção "Protocolo para o filtro de aprendizado de máquina"). Se algo abaixo mudar depois de ver resultados, a mudança entra como "desvio" no `RESULTADOS.md`, com o motivo, e o resultado original continua visível.

## Pergunta

Um filtro de meta-rotulamento (aprovar ou vetar cada sinal da regra primária) melhora a regra primária fora da amostra, depois dos custos, mais do que um filtro aleatório com a mesma taxa de aprovação?

## Estratégia primária (P1)

- Modelo `donchian-20-10` de `packages/dominio/src/modelos.ts` (entrada: fechamento acima da máxima dos 20 candles anteriores; saída: fechamento abaixo da mínima dos 10 anteriores; stop = 2 ATR(20) limitado a 10%; alvo líquido 60%), mais a regra extra de entrada `preço > SMA(200)`.
- Só comprado (à vista), uma posição por par por vez. Um novo sinal só vale a partir do candle seguinte ao da saída da operação anterior do mesmo par.
- Velas de 4 h. Decisão no fechamento do candle; entrada na abertura do candle seguinte, com deslizamento.
- Barreira de tempo (horizonte): 120 velas de 4 h (20 dias). Sem saída por stop, regra ou alvo até lá, fecha no fechamento da 120ª vela. Esse é o "tempo máximo" do protocolo, e o embargo é de 20 dias.
- Custos de cripto iguais aos padrões do backtest: taxa de 0,1% por lado e 7 pontos-base contra (5 de deslizamento + 2 de meio spread).
- Rótulo: `1` se o retorno líquido da operação (depois das duas taxas e do deslizamento) for maior que zero; `0` caso contrário. O desfecho vem de `simularDesfecho` (`packages/dominio/src/placar/desfecho.ts`), chamado com `preco` = abertura do candle seguinte.

## Universo e dados

- 15 pares USDT da Binance: BTC, ETH, BNB, SOL, XRP, ADA, DOGE, LTC, LINK, DOT, TRX, AVAX, ATOM, BCH, ETC.
- Critério: pares líquidos hoje (entre os de maior volume em USDT) com mais de cinco anos de histórico na Binance spot. **Limite declarado:** a lista foi escolhida em 2026 olhando quem sobreviveu e segue líquido, então há viés de sobrevivência (favorece levemente qualquer estratégia comprada). Não foi ajustada depois de ver resultados.
- Dados: klines mensais públicos de `data.binance.vision` (sem chave), de 2019-01 até 2026-09 (último mês completo), ou desde a listagem do par. O SHA-256 de cada zip é conferido. Timestamps em microssegundos (arquivos de 2025 em diante) são convertidos para milissegundos. Lacunas de manutenção da Binance são aceitas e contadas.
- Se o experimento de 4 h tiver menos de ~1.000 sinais, roda-se um segundo experimento SEPARADO com velas de 1 h (horizonte 480 velas = 20 dias, mesmas regras e parâmetros em tempo), reportado à parte.

## Features (22, todas normalizadas, calculadas até o fechamento do candle do sinal)

Retornos log de 1, 3, 6, 12, 24 e 48 velas; ATR(14)/preço; percentil do ATR(14) nas últimas 100 velas; distância ao SMA(200) e à EMA(50) em ATRs; inclinação do SMA(200) (variação % por vela, em 10 velas); ADX(14); RSI(14); largura das bandas de Bollinger (20, 2) / média; volume relativo (20); distância do fechamento ao topo do canal de Donchian(20) em ATRs; retornos log do BTC em 6 e 24 velas (para o BTC, são os próprios); hora do dia e dia da semana (UTC) como seno e cosseno. Sem preço nominal. Sem identidade do par.

## Validação

- **Walk-forward de janela crescente por tempo global**, 6 dobras de teste: 2021, 2022, 2023, 2024, 2025 e 2026-01 a 2026-09 (cada dobra testa os sinais com fechamento do candle do sinal dentro do período). Todas as moedas entram juntas; nunca uma moeda no treino e outra no teste na mesma data.
- **Purge e embargo:** o treino de cada dobra só contém operações que TERMINARAM até 20 dias antes do início do teste (`fim_em ≤ início − 20 dias`). Isso remove as sobrepostas ao teste (purge) e aplica o embargo de 20 dias (a duração máxima de uma operação).
- Dobra com menos de 150 operações no treino ou com uma classe só: o filtro não é aplicado (aprova tudo, igual à regra pura) e isso é reportado.
- **Pesos por unicidade:** para cada operação, `u = média, sobre as velas da operação, de 1 / (nº de operações abertas na mesma vela, todos os pares)`; peso = `max(u, 0,25)` (teto de 4 operações simultâneas), normalizado para média 1 no treino.
- Padronização (média e desvio) ajustada só no treino.

## Modelos (hiperparâmetros fixados, sem busca)

- **Logística L2:** `LogisticRegression(C=0.1, lbfgs, max_iter=2000)` com pesos de unicidade.
- **LightGBM raso:** `LGBMClassifier(n_estimators=120, learning_rate=0.03, max_depth=3, num_leaves=7, min_child_samples=40, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=5, random_state=0, n_jobs=1)` dentro de `CalibratedClassifierCV(method="sigmoid", cv=3)` (3 blocos contíguos, sem embaralhar, só com dados de treino). Nunca isotônica.
- **Corte pelo valor esperado líquido:** aprova se `p × G − (1 − p) × L > 0`, com `G` = ganho líquido médio das operações vencedoras do treino e `L` = perda líquida média (em módulo) das perdedoras do treino, ambas ponderadas pela unicidade. `G` e `L` já saem dos retornos depois das taxas e do deslizamento, então os custos estão dentro do valor esperado (não se subtraem de novo).

## Métricas fora da amostra (juntando as 6 dobras)

- Número de operações aprovadas, acerto, retorno líquido médio por operação.
- **Série diária de retorno:** cada operação aprovada aloca 1/15 do capital e entra no dia (UTC) da sua saída com seu retorno líquido × 1/15; dias sem saída valem zero; o período é de 2021-01-01 a 2026-09-30 para todos os candidatos (mesma base de capital e mesmo número de dias).
- **Sharpe anualizado** = média/desvio diário × raiz de 365.
- **Sharpe deflacionado** (Bailey & López de Prado, 2014) sobre o Sharpe diário, com assimetria e curtose da própria série e `N` = número de configurações testadas, contando a regra pura: **N = 3** (regra pura, logística, LightGBM) no experimento de 4 h; **N = 6** se o experimento de 1 h também for rodado (as 3 configurações de cada um). A variância entre tentativas é a variância dos Sharpes diários das N configurações.
- **Filtro aleatório:** para cada dobra, a mesma taxa de aprovação do modelo naquela dobra, 1.000 rodadas, semente fixa (`numpy.random.default_rng(20261020)`), mesma série diária e mesmo Sharpe. Percentis p50 e p95 da distribuição nula, e o percentil do modelo nela.

## Critério de sucesso (do protocolo, sem alteração)

Um modelo passa se, no mesmo experimento: (a) seu Sharpe deflacionado fora da amostra for MAIOR que o da regra pura; E (b) seu Sharpe (diário, anualizado) passar do percentil 95 do filtro aleatório com a mesma taxa de aprovação. Logística e LightGBM são comparados entre si. Se nenhum passar, o resultado é "não passou" e o filtro não entra no motor. Não se procuram outras configurações depois de ver os resultados.
