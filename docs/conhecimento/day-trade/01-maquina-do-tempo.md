# Máquina do tempo: como ler o histórico da mesma regra

Antes de opinar sobre um sinal, olhe o que a MESMA regra fez no passado deste ativo. O motor mede isso e manda no pedido, na seção "Histórico da mesma regra".

**O que cada número quer dizer**

- **Total**: todas as operações que a regra abriu no período (no WIN, os 2 anos anteriores), com quantas deram lucro líquido e o resultado médio por operação, em % do valor negociado, já descontados tarifa e deslizamento.
- **Mesma faixa de horário**: só as entradas a até 1 hora do horário do sinal. O mini índice se comporta diferente na abertura, no almoço e no fim do pregão; este recorte costuma dizer mais que o total.
- **Mesmo lado**: só as compras ou só as vendas. Em mercado de alta, as vendas da mesma regra costumam ir pior.
- **Simulação do resto da sessão**: o resto do pregão sorteado milhares de vezes a partir de velas de 5 minutos do mesmo horário nos ~100 dias anteriores. Diz quantas vezes o stop veio antes do alvo. É uma checagem de realidade, não uma previsão.

**Como julgar**

- Acerto sozinho não decide. Uma regra que acerta 35% e ganha 3 vezes o que perde é boa; uma que acerta 70% e perde 3 vezes o que ganha é ruim. O que decide é o **resultado médio por operação** (a esperança), depois dos custos.
- Ponto de equilíbrio pelo alvo em múltiplos do risco (R): com alvo de 1R, precisa acertar 50%; com 2R, 33%; com 3R, 25%. Fórmula: 1 ÷ (1 + R).
- Amostra pequena engana: menos de 30 operações no total ou 20 no recorte é ruído. Nesses casos, use o histórico só como referência.
- Resultado médio perto de zero (alguns milésimos de %) é "cara ou coroa": diga isso com franqueza, sem enfeitar.
- O histórico não enxerga o que nunca aconteceu nele: dia de eleição, Copom, payroll, circuit breaker, notícia forte. Nesses dias, o passado vale menos; é o caso de reduzir o tamanho ou vetar com o motivo concreto.

Adaptado de day-trader-skill (Jake Schincariol, licença MIT), skill trader-timemachine: github.com/Jakeschincariol/day-trader-skill.
