# Resultados: filtro de aprendizado de máquina (Etapa 2)

Protocolo e parâmetros: [`PRE-REGISTRO.md`](PRE-REGISTRO.md), commitado antes dos resultados. Nenhuma configuração foi ajustada depois de ver os números (N = 3 tentativas: regra pura, logística, LightGBM). Reprodução: `baixar-dados.ts` → `gerar-dataset.ts` → `avaliar.py` (saída em `resultados-4h.json`).

## Dados

15 pares USDT, velas de 4 h, 2019-01 a 2026-09. P1 = Donchian 20/10 + preço > SMA(200), comprado, uma posição por par. **2.665 sinais** com desfecho conhecido (mais 2 pendentes no fim dos dados, descartados), 31,3% com retorno líquido positivo. Como passou de ~1.000 sinais, **não** se rodou o experimento de 1 h. Saídas: regra 1.313, stop 1.254, alvo 83, horizonte 15. Testam-se 2.161 sinais (de 2021-01 a 2026-09); 2019 e 2020 só treinam.

## Fora da amostra (6 dobras, 2021 a 2026-09)

| Candidato | Operações | Acerto | Retorno médio/op. | Retorno somado (% do capital, 1/15 por op.) | Sharpe anual | Sharpe deflacionado | AUC |
|---|---|---|---|---|---|---|---|
| Regra pura (todos os sinais) | 2.161 | 29,7% | 0,99% | 142,2 | 1,235 | 0,99955 | n/a |
| Logística L2 (C=0,1) | 1.964 (91%) | 30,1% | 1,05% | 137,9 | 1,297 | 0,99981 | 0,523 |
| LightGBM raso + Platt | 2.161 (100%) | 29,7% | 0,99% | 142,2 | 1,235 | 0,99955 | 0,500 |

Filtro aleatório (1.000 rodadas, mesma taxa de aprovação por dobra), Sharpe anual:

| Modelo | p50 | p95 | Sharpe do modelo | Percentil do modelo |
|---|---|---|---|---|
| Logística | 1,102 | 1,264 | 1,297 | 96,8 |
| LightGBM | 1,235 | 1,235 | 1,235 | n/a (não vetou nada) |

## Veredito pelo critério do protocolo

- **LightGBM: não passou.** O corte pelo valor esperado nunca vetou um sinal fora da amostra (a probabilidade calibrada ficou sempre acima do limiar de ~0,22 a 0,24), então é idêntico à regra pura. AUC 0,500.
- **Logística: passa o critério ao pé da letra** (Sharpe deflacionado 0,99981 > 0,99955 da regra e Sharpe 1,297 > p95 do aleatório, 1,264), **mas por uma margem que não sustenta a integração**:
  - Os dois Sharpes deflacionados estão saturados perto de 1 (a própria regra pura já tem Sharpe 1,2 em ~5,7 anos); a diferença de 0,0003 não discrimina nada.
  - A AUC fora da amostra é 0,523, quase acaso. O filtro vetou 197 sinais (9%) e o **retorno somado caiu** (137,9 contra 142,2); o Sharpe sobe só porque a volatilidade diária cai um pouco.
  - Análise pós-hoc e descritiva (`diagnostico.py`, fora do critério): bootstrap por blocos mensais da diferença de Sharpe anual (logística − regra) dá p5 = −0,14, p50 = +0,07, p95 = +0,27, com 72% das rodadas acima de zero. Não se distingue de zero. Por ano, as operações vetadas tiveram retorno médio menor que as aprovadas em todos os anos (a ordenação vai no sentido certo), mas foram positivas em 2021 (+1,5%) e 2024 (+1,4%), então vetá-las tirou retorno; só foram negativas ou nulas em 2022, 2023, 2025 e 2026.
  - Passar do p95 do aleatório com percentil 96,8 é uma margem pequena para uma única amostra e uma única semente.

**Conclusão:** o filtro de aprendizado de máquina não mostrou melhora econômica relevante sobre a regra pura. O critério literal é cumprido só pela logística, de forma estreita; a leitura honesta é "sem evidência de ganho". Recomendação: **não integrar ao motor** com base neste resultado. Se o usuário quiser insistir, o próximo passo é confirmar em dados novos (o experimento de 1 h com o mesmo protocolo e N = 6, ou dados a partir de 2026-10), não ajustar hiperparâmetros aqui.

## Limites

- **Viés de sobrevivência:** a lista de 15 pares foi escolhida em 2026 entre os que seguem líquidos.
- **Execução:** a entrada é na abertura do candle seguinte com deslizamento, mas a saída por regra e por tempo executa no fechamento do candle (como o desfecho do placar). A regra pura tem retorno médio de 0,99% por operação e acerto de 30%: perfil de seguidor de tendência, com poucos ganhos grandes (2021 pesa muito).
- **Sharpe diário com capital 1/15 por operação** (dias sem saída valem zero) é uma convenção pré-registrada; não modela limite de posições simultâneas nem tamanho pela volatilidade.
- **Dobras desiguais:** 2021 tem a maior amostra de teste (449) e o menor treino (479). Lacunas de manutenção da Binance (até 4 velas por par) foram aceitas. Custos fixos (0,1% + 7 bps por lado); sem custo de financiamento nem impacto de mercado.
- **Dados:** só spot da Binance, sem dados de livro de ofertas; 22 features técnicas. Outras famílias de features não foram testadas (seria nova tentativa).
- **Desvios do pré-registro:** nenhum. O `diagnostico.py` e o bootstrap são pós-hoc, descritivos, e não alteram o veredito.
