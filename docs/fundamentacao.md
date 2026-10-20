# Fundamentação: o ZenTrade segue a prática real de robôs de investimento?

Este documento junta o que reguladores, estudos e plataformas de mercado dizem sobre robôs de investimento e mostra onde o ZenTrade se encaixa. Serve para responder, com fonte, a pergunta "isso é real ou é invenção?".

> **Aviso.** Pesquisa feita em outubro de 2026. Não é recomendação de investimento nem parecer jurídico. Resultado passado não garante resultado futuro.

## Resumo

- **O desenho do ZenTrade segue o padrão profissional.** Ele tem regras determinísticas, um motor de risco com a palavra final, papel e testnet antes do dinheiro real, aprovação humana, botão de parada geral e trilha de auditoria. A IA só propõe e não afrouxa nenhum limite.
- **O ZenTrade se valida como software de execução e de disciplina de risco, não como máquina de lucro.** A evidência é dura:
  - [97% dos day traders persistentes perderam dinheiro](#o-que-se-sabe-sobre-resultados);
  - a [CVM](https://www.gov.br/investidor/pt-br/investir/como-investir/profissionais-do-mercado/robos-de-investimentos) diz que não há estudo mostrando lucratividade maior com robôs.
- **Uma estratégia só se valida com custos reais, teste fora da amostra e controle de overfitting.** Um backtest bonito sozinho não prova nada.

## Como robôs são construídos e validados

A sequência que se repete na literatura e nas ferramentas (Freqtrade, Hummingbot, MetaTrader, Profit):

1. **Hipótese antes dos dados.** Diga por que a vantagem existiria e quem paga por ela. Testar combinações sem hipótese é _data snooping_.
2. **Regras determinísticas.** Codifique entrada, saída, stop, tamanho da posição e horários.
3. **Backtest com custos.**
   - Inclua taxa (Binance Spot VIP 0: 0,1% por lado [29]), slippage e spread.
   - Não use dados do futuro (_look-ahead_) [19].
   - Atenção à ordem dos eventos dentro do candle [18].
   - Atenção ao viés de sobrevivência: 39,5% das criptomoedas foram deslistadas [34].
4. **Controle de overfitting.**
   - Registre quantas variações foram testadas (N). Sem N não dá para avaliar o resultado [13][14].
   - Corrija o Sharpe pelo número de tentativas (Deflated Sharpe [15], _haircut_ de Harvey & Liu [16]).
5. **Fora da amostra e walk-forward.** Otimize numa janela, teste na seguinte e repita [17][25].
6. **Papel ou testnet com dados ao vivo.** O backtest nunca substitui essa etapa [18][22][24][27].
7. **Pouco dinheiro real**, com monitoramento e critérios de desligamento.

## Famílias de estratégia e a evidência em cripto

| Família                                               | Evidência                                                                                                                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tendência e momentum (médias, rompimento de Donchian) | A melhor que existe, mas frágil: momentum forte em cripto [32]. Cerca de 15 mil regras técnicas não acharam previsibilidade para o Bitcoin fora da amostra; para outras moedas, acharam alguma [33]. |
| Reversão à média (RSI, Bollinger)                     | Existe em horizontes curtos [36], justamente onde taxa e slippage consomem a vantagem.                                                                                                               |
| Grid                                                  | Não há estudo revisado por pares que a sustente. O risco é o rompimento da faixa em tendência.                                                                                                       |
| DCA                                                   | É disciplina para entrar no mercado, não estratégia de lucro: o aporte único supera o DCA em cerca de 2/3 dos períodos [37].                                                                         |
| Arbitragem e market making                            | Exigem latência, capital e saque entre exchanges [35][23]. Não servem para um robô de varejo numa exchange só.                                                                                       |

As estratégias de exemplo do ZenTrade servem para estudo e **não são recomendação**.

## Controles de risco tratados como padrão

Os itens abaixo aparecem de forma consistente em B3 [1], Nelogica [4], CM Capital [3], Freqtrade [18][20], Hummingbot [23] e na documentação da Binance [26][28][30].

- Stop em toda posição, de preferência registrado na exchange (STOP_LOSS_LIMIT, OCO) [28].
- Perda máxima por dia ou por período, com parada automática [1][4].
- Botão de parada geral que barra **novas entradas**; a venda de proteção continua saindo [23].
- Proteções de circuito:
  - queda máxima;
  - pausa depois de N stops seguidos;
  - pausa depois de perda [20].
- Teto de posições abertas e de exposição.
- Tamanho da posição por fração fixa do capital. Se for usar Kelly, use só uma fração dele [38].
- Respeito aos limites da API: recuar com HTTP 429, e o HTTP 418 é banimento de IP [26].
- Chave de API só com permissão de operar (nunca de saque) e lista de IPs permitidos [30]. Um vazamento de chaves em 2022 causou cerca de US$ 20 milhões em perdas [31].
- Conciliação do estado local com a exchange [1].

## Métricas e sinais de alerta

**Métricas usuais:** retorno líquido de custos, Sharpe, Sortino, queda máxima e sua duração, profit factor, expectativa por operação, payoff, taxa de acerto, número de operações e tempo exposto, além da comparação com comprar e segurar.

**Sinais de alerta:**

- Número de tentativas não informado [13][14].
- Sharpe alto depois de muitas tentativas [15][16].
- Resultado fora da amostra muito pior que dentro [17][25].
- Resultado que depende de custo zero ou de preenchimento perfeito [18].
- Poucas operações. É heurística: o critério formal é o comprimento mínimo de backtest [14].

## IA no processo

- **Reguladores:**
  - a IA "não prevê o futuro", e promessa de retorno alto com robô de IA é sinal de fraude (CFTC) [39];
  - a ESMA pede testes, monitoramento e supervisão humana e alerta para a alucinação [40];
  - a responsabilidade é de quem presta o serviço, não da máquina (Res. CVM 19, art. 17) [6].
- **Academia:**
  - modelos de linguagem extraem sinal de notícias [44];
  - mas backtests feitos antes da data de corte de treino do modelo são contaminados, porque ele "lembra" o que aconteceu [43];
  - em 20 anos de dados, as estratégias com LLM perdem a vantagem e sofrem mais nas quedas [45].
- **Dinheiro real:** num torneio curto e alavancado, 4 de 6 modelos perderam [46].

**Como isso aparece no ZenTrade:** a IA propõe, explica e pode vetar ou reduzir. Execução e limites são determinísticos e ficam fora do alcance do modelo. Há aprovação humana e botão de parada.

## Decisões calibradas com modelos de linguagem

- **Probabilidade se mede, não se declara.** Uma previsão em probabilidade só vale se for calibrada: o que é dito com 70% deve acontecer perto de 70% das vezes. O escore de Brier (erro quadrático médio entre a probabilidade dita e o que aconteceu) é a régua clássica para isso [49].
- **Modelos de linguagem exageram a confiança.** Quando se pede ao modelo que diga a própria confiança em palavras, ele tende a superestimá-la, imitando o jeito humano de falar com segurança; a calibração melhora com modelos maiores, mas nenhuma técnica resolve sozinha [51].
- **Pre-mortem.** Imaginar que a decisão já deu errado e listar por quê faz aparecer riscos que ninguém diria no planejamento [50]. Pedir ao modelo o melhor argumento contra a própria proposta é a versão automática dessa ideia.
- **Várias linhas de raciocínio ajudam, mas custam.** Amostrar vários raciocínios e ficar com a resposta mais frequente (self-consistency) [52] ou explorar uma árvore de alternativas (Tree of Thoughts) [53] melhora o resultado, ao preço de várias chamadas ao modelo. Uma resposta só que já descreve três cenários (alta, lateral, baixa) captura parte desse ganho pelo custo de uma chamada.
- **A IA como segundo filtro.** Na meta-rotulagem de López de Prado, uma regra primária escolhe o lado e um segundo modelo decide só se vale agir e com que tamanho. Na tripla barreira, cada operação é rotulada pela primeira barreira que o preço tocar: alvo, stop ou tempo [54].
- **Texto recuperado é dado, não instrução.** Notícias e documentos buscados pelo sistema podem trazer comandos escondidos para o modelo (injeção indireta de prompt) [55].

**Como isso aparece no ZenTrade:** o analista devolve três cenários com probabilidade, horizonte em candles, gatilho, invalidação e resultado estimado líquido de custos. O código, não o modelo, calcula o valor esperado e só deixa propor operação se ele for positivo e se o cenário favorável passar do limiar. O modelo escreve o argumento contra a própria proposta e a confiança precisa refletir esse argumento. A IA filtra o sinal da regra; a saída real continua sendo stop, regra de saída ou tempo. Trechos da base de conhecimento e notícias entram como dados de terceiros.

## O que se sabe sobre resultados

- Chague, De-Losso e Giovannetti (FGV/USP, dados da CVM) [11]:
  - 97% dos que fizeram day trade de mini-índice por mais de 300 dias perderam dinheiro;
  - só 1,1% ganhou mais que um salário mínimo;
  - não houve sinal de aprendizado com a experiência.
- As perdas brutas dos day traders chegaram a R$ 9,9 bilhões até dezembro de 2023 [12].
- Não existe dado auditado de desempenho de robôs de cripto para o varejo; o que circula é material de venda.

## Regulação no Brasil (não é parecer jurídico)

- **Uso próprio, com a própria chave:** não encontramos regra que exija registro.
- **Código aberto que a própria pessoa configura e roda:** é o caso mais próximo de "sistema que operacionaliza decisões do próprio investidor", que fica fora do credenciamento [5].
- **Estratégias prontas ou sinais oferecidos a terceiros como serviço:** aproxima-se de análise ou consultoria de valores mobiliários (Res. CVM 19 e 20) [5][6][7].
  - Criptoativo só é valor mobiliário em certos casos (Parecer CVM 40) [9].
  - As exchanges passaram a ser reguladas pelo BCB em 2026 [10].
  - Para estratégias automatizadas, a APIMEC recomenda uma lâmina com metodologia e riscos [48].
- **Nunca prometer rentabilidade.** No caso do "robô" Atlas Quantum, a CVM aplicou mais de R$ 55,8 milhões em multas [47]. Consulte um advogado antes de oferecer o ZenTrade a terceiros.

## Literatura revisada em 20/10/2026

Só entram fontes que foram verificadas. Elas mudaram duas decisões do projeto: executar a ordem na abertura do candle seguinte (opção de backtest) e exigir que um filtro de aprendizado de máquina cubra os custos antes de ser aceito.

- Islas Anguiano e García-Medina [56] comparam LightGBM e LSTM com médias móveis (EMA), MACD+ADX e buy and hold em bitcoin. O LSTM rendeu cerca de 65% em menos de um ano, mas é um período só: evidência fraca de robustez, não de lucro futuro.
- Bysik e Ślepaczuk [57] testam bitcoin por hora (2018 a 2026) com 27 dobras de walk-forward e custo de 10 pontos-base por operação. As estratégias que operam pelo sinal da previsão perdem a vantagem depois do custo. Um filtro que só opera quando a magnitude prevista cobre o custo recupera lucro em algumas configurações, e nenhum modelo foi estatisticamente superior aos demais. É a base do corte de aprovação do protocolo abaixo.
- Rosa [58] testa day trade técnico no WINFUT contra buy and hold: há períodos de lucro bruto, mas os custos e a volatilidade dominam o resultado.
- Os métodos vêm de López de Prado [54] (barreira tripla e meta-rotulagem no cap. 3, unicidade de amostras no cap. 4, validação cruzada com purge e embargo no cap. 7), de Chan [59] (regime: reversão à média contra momento, com testes ADF e expoente de Hurst) e de Pardo [17] (análise walk-forward). O estudo da FGV [11] segue como a principal evidência sobre o mini-índice.

Outras referências do material revisado foram descartadas: uma não foi encontrada (Souza, 2020, FATEC), uma é descritiva e não testa resultado (Rodrigues, 2021, UFPA) e uma tem evidência fraca (Rahaman et al., 2023, BEEI: sentimento do Twitter e Prophet em período curto).

## Protocolo para o filtro de aprendizado de máquina (Etapa 2, pesquisa em Python fora do sistema)

Este é o contrato da próxima etapa. O filtro de aprendizado de máquina só é pesquisado fora do ZenTrade e só entra no motor se passar por todas as regras abaixo.

1. **Só features estacionárias ou normalizadas.** Variações percentuais ou múltiplos de ATR; nunca preço nominal.
2. **Walk-forward com purge e embargo.** O embargo é, no mínimo, a duração máxima de uma operação (o tempo máximo da estratégia ou o horizonte da barreira tripla).
3. **Várias moedas no mesmo conjunto de dados.** A divisão treino/teste e o embargo seguem o timestamp GLOBAL: nunca uma moeda no treino e outra no teste na mesma data. Cada amostra pesa o inverso do número de sinais simultâneos (unicidade de amostras, López de Prado, cap. 4).
4. **Rótulos pela barreira tripla com as MESMAS saídas da estratégia.** Reaproveitar o desfecho contrafactual do placar (`packages/dominio/src/placar/`), com a execução escolhida na estratégia (abertura do candle seguinte).
5. **Poucos eventos: mais histórico e mais moedas.** Ampliar o histórico (Binance desde 2017 a 2019) e usar de 10 a 20 moedas líquidas. Com menos de cerca de 1.000 sinais, a favorita é a regressão logística com regularização L2: a probabilidade sai bem calibrada pela log-loss e leva-se ao TypeScript com um produto escalar e uma sigmoide. O LightGBM entra só como comparação, com árvores rasas (`max_depth` ≤ 3 a 4, `num_leaves` ≤ 15, `min_child_samples` alto) e calibração sigmoide (Platt) feita dentro do treino. Nunca isotônica.
6. **Hiperparâmetros fixados antes.** Toda configuração testada entra no número de tentativas do Sharpe deflacionado.
7. **Corte de aprovação pelo valor esperado líquido.** O filtro só aprova o sinal se p × ganho médio − (1 − p) × perda média − custos > 0, depois de taxas e deslizamento. Ganho e perda médios são estimados só no treino. É a linha de Bysik e Ślepaczuk [57].
8. **Comparações obrigatórias.** (a) A regra pura, sem filtro. (b) Um filtro aleatório com a mesma taxa de aprovação, rodado cerca de 1.000 vezes: é a distribuição nula, e o modelo precisa passar do percentil 95. (c) Regressão logística contra LightGBM.
9. **Critério de sucesso.** Bater a regra pura no Sharpe deflacionado fora da amostra e passar do percentil 95 do filtro aleatório. Só então o filtro é integrado ao motor.

## O que o ZenTrade faz em relação a cada prática

O estado de cada item está em [`README.md`](../README.md) e nos documentos [`estrategias.md`](estrategias.md), [`operacao.md`](operacao.md) e [`seguranca.md`](seguranca.md). Em linhas gerais:

| Prática                                                         | Onde está                                                             |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| Regras determinísticas e explicáveis                            | `packages/dominio/src/regras.ts`                                      |
| Motor de risco com a palavra final; a IA não afrouxa limite     | `packages/dominio/src/risco.ts`, `apps/motor/src/nucleo/plano.ts`     |
| Papel, testnet e portão de dinheiro real (2FA + reautenticação) | `apps/motor`, `apps/api/src/rotas/robos.ts`                           |
| Parada geral, vigia de saúde e auditoria encadeada              | `apps/api/src/rotas/parada.ts`, `infra/n8n`, `packages/banco`         |
| Limites da API da Binance (429/418, disjuntor)                  | `packages/corretora/src/cliente.ts`, `disjuntor.ts`                   |
| Backtest, métricas e validação fora da amostra                  | `apps/motor/src/backtest`                                             |
| Execução na abertura do candle seguinte (opção, mais cautelosa) | `execucao: "proximaAbertura"` em `packages/contratos/src/backtest.ts` |
| Filtro de horário (janela em que a regra vale)                  | regra `horario` em `packages/dominio/src/regras.ts`                   |

## Fontes

1. Bora Investir/B3 — [Robô trader: veja como automatizar os investimentos no day trade](https://borainvestir.b3.com.br/noticias/robo-trader-veja-como-automatizar-os-investimentos-no-day-trade/)
2. Nelogica — [Robôs traders: saiba como automatizar as suas operações](https://blog.nelogica.com.br/robos-traders-saiba-como-automatizar-as-suas-operacoes/)
3. CM Capital — [Robô Trader](https://cmcapital.com.br/blog/robo-trader/) (lido pela cópia do Wayback Machine)
4. Nelogica — [Automação de estratégias: o seu primeiro robô trader no Profit](https://blog.nelogica.com.br/automacao-de-estrategias-o-seu-primeiro-robo-trader-no-profit/)
5. CVM/gov.br — [Robôs de investimentos](https://www.gov.br/investidor/pt-br/investir/como-investir/profissionais-do-mercado/robos-de-investimentos)
6. [Resolução CVM 19 (consolidada)](https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/001/resol019consolid.pdf)
7. CVM — [Esclarecimentos sobre atividade de analista de valores mobiliários](https://www.gov.br/cvm/pt-br/assuntos/noticias/2019-1/esclarecimentos-sobre-atividade-de-analista-de-valores-mobiliarios-26d13f699fff4cef8f1d3e808a6453dd)
8. ConJur — [Robôs precisam de aprovação específica para atuar na Bolsa?](https://www.conjur.com.br/2024-jan-03/robos-precisam-de-aprovacao-especifica-para-atuar-na-bolsa/)
9. CVM — [Parecer de Orientação 40 sobre criptoativos](https://www.gov.br/cvm/pt-br/assuntos/noticias/2022/cvm-divulga-parecer-de-orientacao-sobre-criptoativos-e-o-mercado-de-valores-mobiliarios)
10. Felsberg — [Marco do BACEN para ativos virtuais (Res. 519/520/521)](https://www.felsberg.com.br/marco-bacen-ativos-virtuais-resolucoes-519-520-521/)
11. Chague, De-Losso & Giovannetti — [Day Trading for a Living?](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3423101)
12. Chague & Giovannetti — [As pandemias de COVID-19 e de day trade no Brasil (RBFin, 2025)](https://periodicos.fgv.br/rbfin/article/download/94291/87989/218914)
13. Bailey et al. — [The Probability of Backtest Overfitting](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253)
14. Bailey et al. — [Pseudo-Mathematics and Financial Charlatanism](https://www.ams.org/notices/201405/rnoti-p458.pdf)
15. Bailey & López de Prado — [The Deflated Sharpe Ratio](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551)
16. Harvey & Liu — [Backtesting](https://www.cmegroup.com/education/files/backtesting.pdf)
17. Pardo — [Walk-Forward Analysis](https://onlinelibrary.wiley.com/doi/abs/10.1002/9781119196969.ch11)
18. Freqtrade — [Backtesting](https://www.freqtrade.io/en/stable/backtesting/)
19. Freqtrade — [Lookahead analysis](https://www.freqtrade.io/en/stable/lookahead-analysis/)
20. Freqtrade — [Protections](https://www.freqtrade.io/en/stable/plugins/)
21. Freqtrade — [Hyperopt](https://www.freqtrade.io/en/stable/hyperopt/)
22. Freqtrade — [Documentação e aviso de risco](https://www.freqtrade.io/en/stable/)
23. Hummingbot — [Kill Switch](https://hummingbot.org/client/global-configs/kill-switch/)
24. Hummingbot — [Paper Trade](https://hummingbot.org/client/global-configs/paper-trade/)
25. MetaTrader 5 — [Strategy Optimization](https://www.metatrader5.com/en/terminal/help/algotrading/strategy_optimization)
26. Binance Spot API — [Limits](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/limits)
27. Binance Spot Testnet — [General Info](https://developers.binance.com/docs/binance-spot-api-docs/testnet/general-info)
28. Binance Spot API — [Trading endpoints](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/trading-endpoints)
29. Binance — [Fee schedule](https://www.binance.com/en/fee/schedule)
30. Binance — [How to Use an API Key Securely](https://www.binance.com/en/blog/security/how-to-use-an-api-key-securely-5-tips-from-binance-8638066848800196896)
31. SiliconANGLE — [3Commas confirma vazamento de chaves de API](https://siliconangle.com/2022/12/29/crypto-trading-service-3commas-confirms-massive-api-key-leak-hack/)
32. Liu & Tsyvinski — [Risks and Returns of Cryptocurrency](https://www.nber.org/papers/w24877)
33. Hudson & Urquhart — [Technical trading and cryptocurrencies](https://research.birmingham.ac.uk/en/publications/technical-trading-and-cryptocurrencies/)
34. Ammann, Burdorf, Liebi & Stöckl — [Survivorship and Delisting Bias in Cryptocurrency Markets](https://www.alexandria.unisg.ch/bitstreams/2bc8397d-47dd-4f66-8467-9004b2c9d212/download)
35. Makarov & Schoar — [Trading and arbitrage in cryptocurrency markets](https://ideas.repec.org/a/eee/jfinec/v135y2020i2p293-319.html)
36. [Intraday return predictability in the cryptocurrency markets: Momentum, reversal, or both](https://www.sciencedirect.com/science/article/abs/pii/S1062940822000833)
37. Vanguard — [Cost averaging: Invest now or temporarily hold your cash](https://corporate.vanguard.com/content/dam/corp/research/pdf/cost_averaging_invest_now_or_temporarily_hold_your_cash.pdf)
38. MacLean, Thorp & Ziemba — [Good and Bad Properties of the Kelly Criterion](https://www.researchgate.net/publication/300558392_Good_and_Bad_Properties_of_the_Kelly_Criterion)
39. CFTC — [Customer Advisory sobre golpes com IA](https://www.cftc.gov/PressRoom/PressReleases/8854-24)
40. ESMA — [Public Statement on AI and investment services](https://www.esma.europa.eu/sites/default/files/2024-05/ESMA35-335435667-5924__Public_Statement_on_AI_and_investment_services.pdf)
41. IOSCO — [Artificial Intelligence in Capital Markets](https://www.iosco.org/library/pubdocs/pdf/IOSCOPD788.pdf)
42. ANBIMA — [Guia de boas práticas para uso de IA](https://www.anbima.com.br/data/files/63/74/15/39/F12C091039E04909EA2BA2A8/Guia_orientativo_boas_praticas_para_o_uso_de_sistemas_de_inteligencia_artificial.pdf)
43. Glasserman & Lin — [Assessing Look-Ahead Bias in Stock Return Predictions Generated By GPT Sentiment Analysis](https://arxiv.org/abs/2309.17322)
44. Lopez-Lira & Tang — [Can ChatGPT Forecast Stock Price Movements?](https://arxiv.org/pdf/2304.07619)
45. Li et al. — [Can LLM-based Financial Investing Strategies Outperform the Market in Long Run?](https://arxiv.org/abs/2505.07078)
46. Protos — [LLM crypto trading contest finds LLMs can't trade crypto](https://protos.com/llm-crypto-trading-contest-finds-llms-cant-trade-crypto/)
47. Correio Braziliense — [CVM multa pirâmide Atlas Quantum](https://www.correiobraziliense.com.br/economia/2024/05/6862309-cvm-aplica-multa-milionaria-em-caso-de-piramide-financeira-de-criptomoedas.html)
48. APIMEC — [Recomendação CCA nº 06/2023: lâminas de estratégias automatizadas](https://www.apimecbrasil.com.br/noticias_comite/recomendacao-cca-no-06-2023-melhores-praticas-para-a-elaboracao-das-laminas-relativas-as-estrategias-automatizadas/)
49. Brier — [Verification of Forecasts Expressed in Terms of Probability (Monthly Weather Review, 1950)](https://journals.ametsoc.org/view/journals/mwre/78/1/1520-0493_1950_078_0001_vofeit_2_0_co_2.xml)
50. Klein — [Performing a Project Premortem (Harvard Business Review, 2007)](https://hbr.org/2007/09/performing-a-project-premortem)
51. Xiong et al. — [Can LLMs Express Their Uncertainty? An Empirical Evaluation of Confidence Elicitation in LLMs (ICLR 2024)](https://arxiv.org/abs/2306.13063)
52. Wang et al. — [Self-Consistency Improves Chain of Thought Reasoning in Language Models (ICLR 2023)](https://arxiv.org/abs/2203.11171)
53. Yao et al. — [Tree of Thoughts: Deliberate Problem Solving with Large Language Models (NeurIPS 2023)](https://arxiv.org/abs/2305.10601)
54. López de Prado — [Advances in Financial Machine Learning (Wiley, 2018), cap. 3: tripla barreira e meta-rotulagem](https://www.wiley.com/en-us/Advances+in+Financial+Machine+Learning-p-9781119482086)
55. Greshake et al. — [Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection (2023)](https://arxiv.org/abs/2302.12173)
56. Islas Anguiano & García-Medina — [Technical Analysis Meets Machine Learning: Bitcoin Evidence (2025)](https://arxiv.org/abs/2511.00665)
57. Bysik & Ślepaczuk — [Machine Learning-Based Bitcoin Trading Under Transaction Costs: Evidence From Walk-Forward Forecasting (2026)](https://arxiv.org/abs/2606.00060)
58. Rosa — trabalho de conclusão de curso (UNIPAMPA, 2025): backtest de day trade técnico no WINFUT contra buy and hold
59. Chan — Algorithmic Trading: Winning Strategies and Their Rationale (Wiley, 2013)
