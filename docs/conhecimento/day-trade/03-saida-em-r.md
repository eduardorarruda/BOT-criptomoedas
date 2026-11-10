# Saída planejada antes de entrar, medida em R

**Antes de qualquer entrada, três números**

1. **Stop**: onde a ideia está errada. Em estrutura (meio da faixa de abertura, fundo do canal) ou pela volatilidade (múltiplo do ATR). Nunca "onde dói menos".
2. **Alvo**: em múltiplos do risco. **R** é a distância da entrada ao stop. Alvo de 1R ganha o mesmo que arrisca; 2R, o dobro.
3. **Hora de zerar**: no WIN, tudo zera até 18:15. Day trade não dorme posicionado.

**Por que medir em R**

- Compara operações de tamanhos e preços diferentes: "+1,5R" diz mais que "+R$ 300".
- A esperança da regra em R é: acerto × ganho médio em R − erro × perda média em R. Se for perto de zero, é cara ou coroa; se for negativa depois dos custos, a regra não presta naquele recorte.
- As estratégias de tendência do ZenTrade (Donchian, P1, P2) acertam pouco (30% a 45% em 15 min) e vivem dos ganhos grandes; cortar esses ganhos cedo destrói a estratégia.

**Cuidados**

- Stop é plano, não garantia: em gap ou mercado rápido, a execução sai pior que o preço do stop.
- Stop a menos de ~1 ATR do preço ou a poucos custos de distância vira saída por ruído.
- Mover o stop só a favor (empate, stop móvel), nunca contra.

Adaptado de day-trader-skill (Jake Schincariol, licença MIT), skill trader-exit: github.com/Jakeschincariol/day-trader-skill.
