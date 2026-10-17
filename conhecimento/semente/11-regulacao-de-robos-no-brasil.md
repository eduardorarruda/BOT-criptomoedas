# Regulação de robôs de investimento no Brasil

Resumo: quando um robô de trading exige registro na CVM, o que muda entre usar na própria conta e oferecer a outras pessoas, e o que as corretoras pedem.

Informação de outubro de 2026. Não é parecer jurídico; consulte um advogado antes de oferecer qualquer serviço a terceiros. Não é recomendação de investimento.

## Uso na própria conta

- A CVM, no Ofício-Circular CVM/SIN 2/2019, entende que serviços automatizados que oferecem **estratégias padronizadas** para indicar oportunidades de operação são análise de valores mobiliários e exigem credenciamento.
- A exceção são os **sistemas que apenas operacionalizam decisões do próprio investidor**, sem restrição de parametrização.
- Um software de código aberto que a própria pessoa configura e roda na própria conta é o caso mais próximo dessa exceção. Não encontramos regra que exija registro para isso.

## Oferecer a terceiros

Conforme o que se oferece, a atividade se aproxima de:

- **análise** de valores mobiliários (Resolução CVM 20);
- **consultoria** (Resolução CVM 19), inclusive feita por sistema automatizado; usar algoritmo não diminui a responsabilidade de quem presta o serviço;
- **administração de carteira** (Resolução CVM 21), quando alguém opera os recursos de outra pessoa.

Estratégias "caixa-preta" ou com pouca margem para a pessoa mexer são as que mais claramente exigem registro. A APIMEC recomenda, para estratégias automatizadas, uma lâmina com metodologia e riscos.

## Corretoras e plataformas

- A B3 recomenda que a plataforma que executa as ordens do robô seja **homologada pela corretora** e que o robô tenha limite de perda por período.
- Ordens por sistema eletrônico seguem as regras de acesso direto ao mercado: o intermediário identifica a origem da ordem e aplica controles de risco antes da negociação (Resolução CVM 35).
- Na prática: usa-se uma plataforma aceita pela corretora (Profit, MT5 ou API parceira), aceita-se o termo de automação que ela pedir e convive-se com os limites de risco dela, que valem por cima dos limites do robô.

## Sinais de alerta (para quem avalia um robô de terceiros)

- Promessa de rentabilidade, principalmente fixa ou garantida.
- Oferta sem registro na CVM de quem presta o serviço.
- Resultado mostrado só em backtest ou em conta demo.
- Pressão para depositar dinheiro numa conta que não é sua, numa corretora autorizada.

A CVM afirma que não há evidência de lucratividade maior com robôs para pessoas físicas. No caso do "robô" Atlas Quantum, a CVM aplicou multas que passam de R$ 55 milhões.

## Fonte(s)

- CVM/gov.br — [Robôs de investimentos](https://www.gov.br/investidor/pt-br/investir/como-investir/profissionais-do-mercado/robos-de-investimentos)
- CVM — [Resolução CVM 20](https://conteudo.cvm.gov.br/legislacao/resolucoes/resol020.html)
- CVM — [Resolução CVM 21](https://conteudo.cvm.gov.br/legislacao/resolucoes/resol021.html)
- CVM — Resolução CVM 35, texto consolidado (só busca): [PDF](https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/001/resol035consolid.pdf)
- Bora Investir/B3 — [Robô trader](https://borainvestir.b3.com.br/noticias/robo-trader-veja-como-automatizar-os-investimentos-no-day-trade/)
- ZenTrade — [`docs/fundamentacao.md`](../../docs/fundamentacao.md) (Res. CVM 19, APIMEC, Atlas Quantum)
