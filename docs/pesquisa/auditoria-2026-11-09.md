# Auditoria do ZenTrade — arquitetura e estratégia (09/11/2026)

Base: leitura do código em `integracao-v2` (último commit 50c9859 + mudanças não commitadas da máquina do tempo) e os resultados de `pesquisa/win-papel/RESULTADO-5anos.md`. Onde não conferi no código, está escrito **"a conferir"**. Resultado de teste com dados passados, não recomendação de investimento.

## Veredito em uma frase

A engenharia está acima da média de bot open source (melhor que a Freqtrade em idempotência e reconciliação). O ponto fraco é a **vantagem estatística**: o lucro esperado é pequeno (~0,1 R por operação), a amostra é curta, e as 3 estratégias foram escolhidas olhando o resultado de 27 combinações. Antes de capital real, o trabalho que falta é de **validação**, não de código.

---

## 1. Tabela comparativa

| Tema | ZenTrade | Freqtrade | Hummingbot |
|---|---|---|---|
| Camadas | Portas e adaptadores: `dominio` (regras puras), `corretora` (papel/Binance), `motor/nucleo` (ciclo), `agente` (IA) | DataProvider / Strategy / Exchange (ccxt) | Connectors / Strategy / Clock (eventos) |
| Estratégia | Declarativa (`Estrategia`: regra de entrada/saída, stop ATR, stop móvel, empate, tempo máximo, tamanho por volatilidade) | Classe Python com `populate_*` em DataFrame | Classe por tipo (MM, arbitragem) |
| Mesma lógica em backtest, papel e real | **Sim** para cripto (corretora de papel com a mesma interface). **Não** para o WIN: o pregão de papel é um script de pesquisa (`pesquisa/win-papel/pregao.mjs`) que roda o backtest sobre o dia | Sim (dry-run) | Sim (paper exchange) |
| Ordem duplicada | **Forte**: `idCliente` derivado da decisão, reservado antes de enviar; erro de rede = PENDENTE, sem reenvio | Fraca (depende do ccxt) | Média (rastreio em memória) |
| Estado incerto | **Forte**: o robô não decide enquanto não confere a ordem incerta na corretora | Parcial | Forte (in-flight orders) |
| Posição | Derivada das execuções (ADR 003), decimal exato (ADR 002) | Do banco de trades | Em memória + eventos |
| Rate limit | Reativo: lê `X-MBX-USED-WEIGHT-1M`, respeita Retry-After, disjuntor por IP no processo (429/418). Balde de tokens antes de chamar: **não encontrei** | Reativo + ccxt rateLimit | **Proativo** (throttler por peso) |
| WebSocket | Espera exponencial com jitter, reconexão antes das 24 h, timeout de silêncio | Não usa (REST) | Sim, robusto |
| Proteção | Stop/alvo na própria corretora (OCO), sai sempre (ADR 007) | Stoploss on exchange | Por estratégia |
| Risco da conta | Perda diária, queda do pico, sequência de stops (robô e conta), exposição, nº de posições, divergência de saldo, pausa após perda, frequência, dia de evento | Protections (cooldown, max drawdown, stoploss guard, low profit pairs) | Kill switch |
| Validação de backtest | Walk-forward (rolante/ancorado), Monte Carlo, avisos de amostra, Sharpe probabilístico e **deflacionado** (`financas/backtest-estatistica.ts`) | Hyperopt + lookahead/recursive analysis | Quase nenhuma |
| Otimização de parâmetros | Não tem (bom: menos overfitting; ruim: escolha manual sem registro de tentativas) | Hyperopt | Não |
| IA | Propõe; risco decide (ADR 001); máquina do tempo decide a entrada com amostra ≥ 30 | FreqAI (ML) | Não |
| Monitoramento de latência | **Não encontrei** | Parcial | Sim |
| B3 / mini índice | Dados via MT5 (só leitura); sem execução real | Não | Não |

## 2. Diagnóstico técnico

### Engenharia — o que está bom (não mexer)
- Ciclo por robô em fila única (`motor/src/trava.ts`): dois candles juntos não compram em dobro.
- Pausa antes de consultar a IA. A proteção não passa por agente, aprovação nem pausa (`nucleo/ciclo.ts`).
- Toda resposta da corretora passa por Zod. Dinheiro em decimal.

### Engenharia — lacunas (por gravidade)
| # | Gravidade | Problema | Onde | Efeito |
|---|---|---|---|---|
| E1 | **Alta** (para o WIN) | O papel do WIN não passa pelo `nucleo`: é um script que roda o backtest sobre o dia. Não testa ordem, reconciliação, risco da conta, atraso de dado nem falha do MT5 | `pesquisa/win-papel/pregao.mjs` | O "papel" do WIN mede a estratégia, não o sistema. Ir para real exigiria um caminho que nunca rodou |
| E2 | Média | Sem guarda de dado velho: não há corte do tipo "candle fechado há mais de X s → não abre posição" (a conferir no `motor.ts`) | `motor.ts`, `nucleo/ciclo.ts` | Depois de reconexão ou atraso da IA, pode entrar a preço que já passou |
| E3 | Média | Rate limit só reativo. Com muitos robôs (42 no papel) e uma rajada de candles, o peso só é visto depois de gasto | `corretora/src/cliente.ts` | 429 → disjuntor trava todos os robôs, inclusive saídas por REST |
| E4 | Média | Sem métrica de latência (candle fechado → ordem enviada → execução) | — | Não dá para medir o deslizamento real contra o do backtest |
| E5 | Baixa | Só ordem a mercado (`enviarOrdemMercado`) | `nucleo/execucao.ts` | Paga spread e deslizamento sempre; ok para rompimento, caro em 5m |
| E6 | Baixa | Disjuntor e trava são do processo (memória) | `corretora/src/disjuntor.ts` | Ok com um processo; com dois motores, não protege. Não fazer agora (YAGNI) |
| E7 | Baixa | A chamada ao Claude fica no caminho do candle | `nucleo/analise.ts` | Em 15m/1h não importa; em 5m come parte da vela |

### Quantitativo
| # | Gravidade | Problema | Evidência |
|---|---|---|---|
| Q1 | **Alta** | **Viés de seleção.** 27 combinações (9 estratégias × 3 tempos), escolhidas as melhores pelo resultado do mesmo período. Somando os testes anteriores, o número real de tentativas é maior | `RESULTADO-5anos.md`. `sharpeDeflacionado` existe, mas não foi aplicado no ranking do WIN |
| Q2 | **Alta** | **Vantagem pequena por operação.** P2 1h: R$ 4.401 em 149 operações = ~R$ 30 por operação, arriscando R$ 300 → **~0,1 R**. Um erro de custo de 1–2 ticks come boa parte | Mesma tabela |
| Q3 | **Alta** | **Amostra curta.** Em 1h são 150–240 operações em 5 anos. Com 60% de acerto e n = 149, o intervalo de 95% vai de ~52% a ~68% | Erro-padrão √(0,6·0,4/149) ≈ 4% |
| Q4 | Média | **Retorno perto do CDI.** 1h dá ~R$ 900–1.300 por ano sobre R$ 10 mil (9–13% a.a. antes do IR, ~7–10% depois). No período o CDI pagou na faixa de 11–14% a.a. sem risco | Mesma tabela |
| Q5 | Média | **Deslizamento otimista.** 1 tick por lado em ordem a mercado no rompimento. O teste de sensibilidade está abaixo | `win/execucao.ts`, `deslizamentoTicks` |
| Q6 | Média | **Risco fixo de 3% por operação** (R$ 300 sobre R$ 10 mil). Explica as quebras em 5m (centenas de operações a 3% cada) | `pregao.mjs: RISCO = "300"` |
| Q7 | Média | **Sorteio da máquina do tempo independente por vela.** `simularResto` sorteia cada vela de 5 min sozinha (do mesmo horário). Isso apaga a autocorrelação e o agrupamento de volatilidade, justamente o que a estratégia de tendência explora. Tende a subestimar o alvo e o stop e a superestimar "nenhum" | `maquina-do-tempo.mjs` |
| Q8 | Baixa | Ambiguidade no candle: stop e alvo na mesma vela contam como stop. É **conservador**, o certo | `saidaNoCandle` |
| Q9 | Baixa | Viés de olhar o futuro: execução na abertura da vela seguinte e histórico da máquina do tempo só com velas **antes** do pregão (730 dias). **Não encontrei vazamento** | `rodar.ts` (`proximaAbertura`), `pregao.mjs` (`operacoesPassadas`) |
| Q10 | Info | Funding não se aplica: cripto à vista; WIN é futuro sem funding. A virada do contrato contínuo cai entre pregões, sem efeito em day trade | — |

**Hipótese de mercado:** as 3 estratégias são **seguidoras de tendência por rompimento** (momento de série temporal intradiário): canal de Donchian, filtro de tendência longa, stop por ATR, saída pelo canal curto e zeragem às 18:15. Não há reversão à média: Bollinger falhou em todos os tempos gráficos, o que confirma a hipótese.

## 3. Plano de refatoração

Em ordem de valor. Os dois primeiros destravam todo o resto.

### R1 — Papel do WIN pelo mesmo núcleo (resolve E1)
Um adaptador de corretora para a B3, com a mesma porta da Binance. O `nucleo` não muda.

```ts
// packages/corretora/src/b3-papel.ts
export class CorretoraB3Papel implements PortaCorretora {
  constructor(
    private readonly fonte: FonteVelasMt5,      // já existe em motor/src/dados-b3/fonte-mt5.ts
    private readonly modelo: ModeloWin,         // tick, tarifa, deslizamento
    private readonly relogio: Relogio,
  ) {}

  async enviarOrdemMercado(o: OrdemMercado): Promise<ResultadoOrdem> {
    const ref = await this.fonte.ultimoPreco("WIN$N");
    if (!ref || this.relogio.agora() - ref.em > IDADE_MAXIMA_COTACAO_MS)
      return rejeitada(o, "cotação do MT5 velha: não executo a preço que já passou");
    const preco = precoExecutado(ref.preco, o.lado, this.modelo.custos.deslizamentoTicks);
    return executada(o, preco, custoDeUmLado(this.modelo, contratos(o)));
  }
  // filtros(): passo 1 contrato, tick 5 pontos; saldoLivre(): margem de day trade
}
```
O laço `rodar.sh` vira um robô comum no motor, com `simbolo: "WINFUT"` e `intervalo: "15m" | "1h"`. Assim o papel do WIN passa por risco da conta, reconciliação e diário.

### R2 — Guarda de dado velho e latência (resolve E2 e E4)
```ts
// nucleo/ciclo.ts, antes de processarSinal abrir posição
const idade = deps.relogio.agora() - e.candle.fechamento;
if (!ehProtecao(sinal) && idade > deps.opcoes.idadeMaximaSinalMs)   // ex.: 20% do intervalo
  return barrar(deps, robo, e, { codigo: "sinal_velho", mensagem: `O candle fechou há ${segundos(idade)}: não abro posição atrasada.` });

// execucao.ts: grava três carimbos por ordem
// candleFechouEm → enviadaEm → executadaEm, mais (precoExecutado − precoDoCandle) em bps
```
Com isso, o painel mostra o deslizamento real contra o do backtest. É o dado que decide Q5.

### R3 — Rate limit proativo (resolve E3)
```ts
// corretora/src/balde-peso.ts
export class BaldePeso {
  constructor(private readonly limitePorMinuto = 6000 * 0.7) {}   // 70% do limite da Binance
  async reservar(peso: number, agora: () => number): Promise<void> {
    // espera até o minuto virar se usado + peso > limite; saídas (proteção) passam na frente
  }
}
```
A fila dá prioridade: proteção, depois saída, depois entrada, depois sincronização da carteira.

### R4 — Sorteio por blocos na máquina do tempo (resolve Q7)
Em vez de uma vela por vez, sortear **um pregão passado inteiro** a partir do mesmo horário, em escala do preço de agora (bootstrap por blocos/sessões). Isso preserva a tendência e a volatilidade do dia. É uma troca pequena em `simularResto`: o "baralho" passa a ser `Map<dia, razões[]>`, e cada sorteio escolhe um dia.

### R5 — Dimensionamento por volatilidade com risco menor (resolve Q6)
O motor já tem `tamanhoPorVolatilidade` (está ligado só na P2). Ligar nas três e trocar R$ 300 fixos por **0,5–1% do patrimônio**. Ajustar a escala por **Kelly fracionário** (¼ Kelly) medido no walk-forward, nunca no período todo:

```
f* = p − (1 − p) / b      (p = acerto, b = ganho médio / perda média, fora da amostra)
risco por operação = min(1%, f*/4) × patrimônio
```

## 4. Matriz de validação antes de capital real

Cada linha é um portão: falhou um, não vai para real.

| # | Teste | Como rodar no ZenTrade | Passa se |
|---|---|---|---|
| V1 | Custo com folga | Repetir o backtest de 5 anos com `deslizamentoTicks` = 2 e 3 | Líquido > 0 com 3 ticks. Estimativa pela tabela: P2 1h cai de R$ 4,4 mil para ~R$ 3,8 mil (passa); P1 5m cai de R$ 24 mil para ~R$ 2 mil (quase zera) |
| V2 | Sharpe deflacionado | `sharpeDeflacionado` com **N ≥ 27** tentativas (contar todas as já feitas) | Probabilidade ≥ 0,95 |
| V3 | Walk-forward | 5 janelas rolantes, 70% dentro, parâmetros **fixos** | Lucro em ≥ 4 de 5 janelas fora da amostra; eficiência ≥ 0,5 |
| V4 | Estabilidade de parâmetros | Variar Donchian ±20% (ex.: 44–66/16–24) e ATR 1,5–2,5 | O resultado é um platô, não um pico (≥ 70% das vizinhanças lucram) |
| V5 | Monte Carlo das operações | 10 mil reordenações (já existe) | Queda no percentil 95 < 2× a queda histórica e < 20% do capital |
| V6 | Regimes | Separar o resultado por ano e por regime (tendência/lateral, já existe `regime.ts`) | Nenhum ano com perda > 1,5× o ganho médio anual |
| V7 | Amostra | Contar operações fora da amostra | ≥ 100 operações fora da amostra por estratégia (Q3) |
| V8 | Contra o CDI | Retorno anual líquido de IR contra o CDI do mesmo período, e Sharpe com o CDI como taxa livre de risco (hoje compara com zero) | Retorno > CDI + prêmio pelo risco que você definir |
| V9 | Papel pelo núcleo | Depois do R1, ≥ 60 pregões no papel pelo motor | Deslizamento medido ≤ o do backtest; zero ordem duplicada ou incerta sem conferência |
| V10 | IA vale o custo | Placar com Claude contra sem Claude no mesmo sinal (já existe) | Com IA melhora o resultado médio, com diferença estatística (teste de permutação, p < 0,05) |
| V11 | Métricas padrão | Sharpe, Sortino, Calmar, queda máxima, fator de lucro **depois dos custos**, payoff, expectativa em R | Fator de lucro ≥ 1,3; expectativa ≥ 0,15 R; Calmar ≥ 1 |

## Ordem sugerida

1. **V1 + V2 + V3 agora.** São só backtests, sem código novo, e dizem se a vantagem existe. Se a P2 1h não passar em V1–V3, nenhuma refatoração salva a estratégia.
2. **R1 + R2**, para o papel do WIN medir o sistema e não só a regra.
3. **R5 e R4** depois que a vantagem estiver confirmada.
4. **R3** só se os robôs da Binance voltarem a crescer.
