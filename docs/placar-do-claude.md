# Placar do Claude: medir se a IA acerta (e o replay para medir mais rápido)

O ZenTrade separa os papéis: **as regras dão o sinal, o Claude decide se pega, o risco tem a palavra final**. Até aqui ninguém media se a decisão do Claude estava certa. O placar faz isso, decisão por decisão, e mostra o resultado na tela (Decisões e Visão geral), na API (`GET /decisoes/placar`) e para o próprio Claude (ferramenta `historico_decisoes`).

> **Aviso.** O placar mede o que já aconteceu. Não é recomendação de investimento e resultado passado não garante resultado futuro.

## O problema certo: meta-rotulagem, não "% de acerto"

Isto é o que López de Prado chama de _meta-labeling_: um modelo primário (as regras) diz **quando** e **para que lado**; um modelo secundário (o Claude) diz **se vale a pena pegar**. As métricas certas para o secundário são:

| Métrica                        | Pergunta                                                                  | Como sai                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Precisão das aprovações**    | Das entradas que o Claude aprovou, quantas deram lucro depois das taxas?  | acertos ÷ aprovações, com o intervalo de Wilson de 95% (com 12 casos, 75% pode ser qualquer coisa de 47% a 91%)                |
| **Vetos certos**               | Dos sinais que ele vetou, quantos teriam dado zero ou prejuízo?           | vetos certos ÷ vetos, pelo contrafactual                                                                                       |
| **O que o Claude agregou**     | Em dinheiro, as aprovações dele foram melhores que aprovar tudo?          | resultado das aprovadas − resultado de todas (aprovadas + vetadas); também as perdas evitadas e os ganhos perdidos pelos vetos |
| **Payoff e acerto necessário** | Quanto se ganha quando acerta contra quanto se perde quando erra?         | ganho médio, perda média, expectativa por aprovação e a precisão que empata: perda ÷ (ganho + perda)                           |
| **Calibração**                 | Quando ele diz 70% de confiança, acerta 70%?                              | Brier score (0 é perfeito; 0,25 é dizer sempre 50%) e tabela por faixa (0,5–0,6, 0,6–0,7…)                                     |
| **Limite de confiança**        | Se só valessem as aprovações com confiança ≥ X, quanto acertaria e daria? | o limite (0,50 a 0,95) de maior resultado com precisão ≥ 80%, com o número de casos                                            |

**Por que "% de acerto" sozinho engana:** 9 ganhos de US$ 1 e uma perda de US$ 20 dão 90% de acerto e prejuízo de US$ 11. A meta do dono do projeto é **pelo menos 80% das aprovações com lucro**; a tela mostra essa meta ao lado do payoff, para a meta não virar armadilha.

Tudo sai por robô, por estratégia, por mercado e no total. Grupos com moedas diferentes (USDT e reais) não somam dinheiro: o limite usa a soma dos retornos.

Com menos de **30 decisões avaliadas** a tela avisa que as porcentagens ainda mudam muito a cada decisão.

## Rótulos

- Só **entradas** (sinal `COMPRAR` da regra) que **passaram pelo Claude** (têm proposta). Saídas por stop e alvo não passam por ele; a saída pela regra fica para depois.
- **Aprovou** = a proposta foi `comprar`. **Vetou** = `aguardar` (ou `vender`).
- **Aprovação certa** = resultado líquido > 0. **Veto certo** = o contrafactual ≤ 0.
- Sem desfecho ainda = **pendente** (não entra nas contas, aparece contado à parte).

## O desfecho de cada decisão

`packages/dominio/src/placar/desfecho.ts` — puro e testado com casos feitos à mão.

1. **Executada e fechada**: o resultado real da posição (o motor já gravava em `decisoes.resultado` quando a venda zera a posição). Executada e ainda aberta: pendente.
2. **O resto** (vetos; aprovações que o modo observar, o risco, a pessoa ou o prazo não deixaram executar): o **contrafactual** — a entrada no fechamento do candle do sinal, com **a mesma saída do backtest**:
   - a cada candle seguinte, stop e alvo **dentro do candle** (`saidaNoCandle`, agora no domínio): salto de abertura sai na abertura; stop e alvo no mesmo candle contam o stop (pior caso);
   - no fechamento, stop móvel e empate (`atualizarStop`) e a decisão da estratégia com a posição aberta (`decidirComSentido`: stop, alvo, regra de saída, tempo máximo);
   - no mini índice, zera na hora da zeragem e no último candle do pregão;
   - sem saída em `MOTOR_PLACAR_HORIZONTE` candles (padrão 500), fecha no fechamento do último (`horizonte`).
3. **Custos**: no cripto, a taxa da estratégia nas duas pontas mais 7 pontos-base contra quem opera (5 de deslizamento + 2 de meio spread, os padrões do backtest); no WIN, o modelo de custos do WIN (tick contra, deslizamento em ticks, tarifa da B3 e corretagem por lado).
4. **Tamanho**: o da decisão (o plano já respeitou o pedido de tamanho do Claude); sem ele (o veto acontece antes do plano), o **tamanho de referência** do robô — perder no stop o risco por operação, sem passar da exposição máxima. No WIN, 1 contrato.
5. Stop e alvo **efetivos** gravados na decisão valem no lugar dos da estratégia.

## Onde roda

- **Banco**: tabela `avaliacoes_decisao` (migração `0014_placar_claude`), uma linha por decisão, RLS por `usuario_id` como as decisões; a aplicação só lê. Índice parcial `decisoes_placar` para achar as candidatas.
- **Motor** (processo `robos`, com banco): a cada `MOTOR_PLACAR_MINUTOS` (5) avalia até `MOTOR_PLACAR_LOTE` (50) decisões dos últimos `MOTOR_PLACAR_DIAS` (30). Lê os candles que o robô gravou ao vivo — nenhuma chamada de rede. Idempotente: concluída não muda mais; pendente é revista quando houver candles novos. `MOTOR_PLACAR=false` desliga.
- **API**: `GET /decisoes/placar?roboId=&desde=` e o campo `avaliacao` em cada item de `/decisoes`.
- **Agente**: a ferramenta `historico_decisoes` traz a avaliação de cada decisão e o placar do robô em frases (o prompt não muda).
- **Tela**: o painel "Placar do Claude" em Decisões (segue o filtro de robô) e o resumo na Visão geral. Funciona no modo demo com dados de exemplo.

## Limites conhecidos

- A estratégia usada no contrafactual é a **versão atual** do robô (a decisão não guarda a versão).
- Candles que faltam (motor fora do ar) são pulados: o contrafactual anda pelos que existem.
- Sem candles de 1 minuto, stop e alvo no mesmo candle contam o stop: o contrafactual é pessimista para as aprovações e otimista para os vetos nesse caso raro.
- Executada sem o resultado real gravado (a venda veio por fora e o motor não achou a compra) fica pendente até sair da janela de 30 dias.
- A confiança do contrato é a da proposta, sem distinguir "confiança em comprar" de "confiança em aguardar": a calibração mede "a escolha dele estava certa".

## Fase 2: replay histórico (desenhado, não implementado)

O placar ao vivo precisa de semanas para juntar 30 decisões por estratégia. O replay mede o Claude em dias, sobre velas já gravadas.

### O comando

```
pnpm --filter @zentrade/motor replay-placar -- \
  --robo <id> --inicio 2026-07-01 --fim 2026-09-30 --maximo 40 [--custo-maximo-usd 2] [--confirmar]
```

1. Carrega as velas do robô no período (banco: o BTC gravado ao vivo, ou o WIN importado por `importar-candles-*`).
2. Recusa a janela se ela começa **antes do corte de conhecimento do modelo** (configurável; o modelo não pode "lembrar" o que aconteceu).
3. Roda as regras candle a candle (as mesmas de `decidir`/`decidirComSentido`) e junta os sinais de entrada; mostra quantos são, o custo estimado (sinais × custo médio por análise do livro `gastos_ia`) e **para**. Só com `--confirmar` segue; `--maximo` e `--custo-maximo-usd` cortam antes de passar do limite.
4. Para cada sinal, chama o serviço do agente (`AgenteHttp`, o mesmo do robô) com o pedido montado **só até aquele candle**.
5. Grava cada resposta como decisão com a marca `origem = 'replay'` (coluna nova, com `check`), estado `registrada`, **sem quantidade executável**. O motor e a API nunca executam nem pedem aprovação de decisão `replay` (barreira no `processarSinal` e no `decidirNa`).
6. O avaliador do placar avalia essas decisões como as outras; o placar ganha o filtro `origem` (ao vivo, replay, ambos).

### O que precisa mudar antes (e por que não entrou agora)

- **Sem olhar o futuro no agente.** Hoje as ferramentas leem o banco "agora": `historico_decisoes` traria decisões posteriores ao candle, `buscar_conhecimento` notas e notícias publicadas depois. O pedido de análise precisa de um `ate` (instante do candle) que todas as ferramentas respeitem (`em < ate`, `publicado_em < ate`). Isso mexe no serviço do agente, que está sendo alterado em paralelo (prompt e cenários), então fica para depois desse merge.
- **Nunca enviar ordem.** Além da marca `replay`, o comando roda sem corretora (porta nula que recusa qualquer ordem) e num processo próprio, fora do `robos`.
- **Custo.** Limite por execução (`--maximo`, `--custo-maximo-usd`) e o orçamento de IA da conta valendo como sempre (o agente já recusa sem orçamento).
- **Testes.** Unidade: geração de sinais sem olhar adiante (o contexto de cada sinal termina no candle dele), corte de conhecimento, limites e confirmação. Integração: um replay curto contra o agente fixo (`AgenteFixo`) gravando decisões `replay` e o placar separando as origens.
