# Checklist de risco do day trade (mini índice e cripto)

Cada ordem passa por estes pontos; qualquer um que falhar barra a ordem, com o motivo.

1. **Perda máxima por operação**: o prejuízo no stop cabe no risco por operação. No WIN: contratos = risco em R$ ÷ (distância do stop em pontos × R$ 0,20), arredondado para baixo. Se nem 1 contrato cabe, não opera.
2. **Perda máxima do dia**: bateu o limite do dia, parou o dia. Sem "recuperar".
3. **Operações por dia/hora**: limite de quantidade, para não operar por impulso depois de uma perda.
4. **Risco/retorno mínimo**: o alvo (ou a saída esperada) paga os custos e o risco; com alvo abaixo de 1R, a regra precisa acertar bem mais de 50%.
5. **Janela de entrada**: dentro do horário permitido (no WIN, fora da abertura e do fim do pregão).
6. **Tamanho e margem**: a posição cabe na exposição máxima e na margem da corretora.
7. **Nada de preço médio**: não aumenta posição perdedora.
8. **Dia de evento**: Copom, payroll, eleição, vencimento: reduzir o tamanho ou não operar. O histórico da regra quase não tem dias assim.

O motor de risco do ZenTrade aplica os itens 1, 2, 3, 5 e 6 sozinho. A IA ajuda nos itens 4 e 8: reduzindo o tamanho ou vetando com um motivo concreto.

Adaptado de day-trader-skill (Jake Schincariol, licença MIT), skills trader-risk e trader-budget: github.com/Jakeschincariol/day-trader-skill.
