# ADR 007 — A proteção sai sempre, e fica na corretora

**Situação:** aceita · 2026-10

## Contexto

Até aqui o stop existia só dentro do motor, conferido no fechamento do candle de 1 minuto, e o risco barrava **toda** ordem com a parada total ligada ou o limite de ordens por hora estourado — inclusive a venda do stop. Três consequências ruins:

- Com "Parar tudo" ligado, o stop era barrado e a posição ficava sem proteção. O vigia do n8n liga a parada total sozinho quando o motor some: um soluço do motor congelava as posições sem stop.
- Robô pausado saía da lista do motor e o stop da posição dele deixava de ser vigiado.
- Se o motor morresse, nada protegia a posição na corretora.

A prática do mercado é o contrário: o botão de pânico barra **entradas novas**; as saídas de proteção sempre podem sair, e o stop fica no livro da corretora, onde vale mesmo com o sistema fora do ar.

## Decisão

**Toda ordem tem uma finalidade** (`FinalidadeOrdem` em `packages/dominio/src/risco.ts`), e as barreiras valem conforme ela:

| Finalidade | O que é                                                          | Pausa / parada total | Frequência    | Agente e aprovação | Modo observar |
| ---------- | ---------------------------------------------------------------- | -------------------- | ------------- | ------------------ | ------------- |
| `entrada`  | compra                                                           | barra                | barra         | sim                | só registra   |
| `saida`    | venda pela regra de saída ou por tempo                           | barra                | barra         | sim                | só registra   |
| `protecao` | venda pelo stop ou pelo alvo; "zerar posição" pedido pela pessoa | **não barra**        | **não barra** | não                | **executa**   |

Quantidade e filtros da corretora valem para todas. Venda abaixo do mínimo da corretora vira a barreira `poeira`, que diz que nenhuma ordem a vende e como recolhê-la.

**Por que o alvo é proteção e a regra de saída não.** O alvo foi combinado na entrada — o mesmo que fica no livro da corretora (OCO). Barrar o alvo do lado do robô enquanto a corretora o executa seria incoerente, e trocar o OCO por um stop sozinho a cada pausa criaria chamadas e falhas justamente na hora em que algo pode estar errado. Já a regra de saída e a saída por tempo são decisões **novas** da estratégia e do agente; quem pausou (a pessoa ou o vigia) desconfia exatamente disso. A posição continua protegida pelo stop e pelo alvo no livro. Pelo mesmo motivo, robô pausado não consulta o agente: a compra é barrada antes de gastar a chamada.

**A posição aberta pelo robô fica protegida até fechar**, qualquer que seja o modo (mesmo se ele mudar para observar) ou a pausa. O motor mantém ligado o robô pausado que ainda tem posição (`PortaRobos.ativos`).

**O stop fica na corretora.** Depois da compra executada, o stop e o alvo efetivos vão para o livro (Binance Spot): OCO pelo `POST /api/v3/orderList/oco` (alvo `LIMIT_MAKER` em cima, `STOP_LOSS_LIMIT` embaixo) ou `STOP_LOSS_LIMIT` sozinho quando o preço já passou do alvo. O preço limite fica `MOTOR_STOP_LIMITE_BPS` abaixo do gatilho (padrão 1%), para executar num mercado rápido. Preços vão no passo da corretora (`tickSize`): stop e alvo arredondados para cima, limite para baixo.

O ciclo de vida, todo idempotente:

- **Reservar antes de enviar** (`protecoes_corretora`, estado PENDENTE), como as ordens: o banco guarda uma proteção viva por robô.
- **A cada candle** o motor confere a proteção viva e grava o que ela executou como a venda que fecha a posição — decisão, ordem (pelo clientOrderId da perna) e execuções, numa transação, uma vez só — e o desfecho na compra. Depois deixa no livro a proteção certa para a posição: troca se o stop efetivo (agente, stop móvel, empate) ou a quantidade mudou; tira se a posição zerou.
- **Antes de o robô vender** por conta própria (regra de saída, tempo, stop no fechamento quando o stop-limit não executou), a proteção sai do livro: ela trava a base, e vender com ela no livro seria vender duas vezes. Se não der para confirmar o cancelamento, o robô não vende e tenta de novo; a proteção segue valendo. A quantidade vendida nunca passa do saldo livre da conta.
- **Na partida**, a proteção do banco é conferida contra a corretora: executada com o motor fora do ar vira venda; sumida do livro ou não enviada é colocada de novo.

O robô continua vigiando stop e alvo no fechamento de cada minuto, como **segunda linha de defesa** — é ela que vende quando o preço passa do limite do stop-limit (gap).

## Consequências

- Parada total, pausa e o limite de frequência nunca deixam uma posição sem saída. O texto da tela ("Parar tudo") diz isso: nada novo entra; stop e alvo seguem valendo.
- Com o motor fora do ar, a posição continua protegida na corretora. O que ficou de fora: o stop no livro é stop-**limit**; num gap maior que a distância do limite, ele dispara e não executa até o motor voltar e vender a mercado.
- O agente não pode mais segurar uma venda pelo alvo: o alvo é o combinado na entrada (o agente já escolhe o mais conservador ali).
- Recusa da corretora, poeira e saldo menor que a posição viram evento de risco para a tela, uma vez; a recusa não é repetida a cada minuto.
- O papel simula o livro do mesmo jeito (dispara pela mínima e pela máxima do candle), então papel e backtest se comportam como a corretora. O "zerar posição" pedido pela pessoa já tem a finalidade no risco, mas o comando (tela → API → motor) ainda não existe.

## Papel e backtest

A `PapelCorretora` (`packages/corretora/src/papel.ts`, regras em `papel-protecao.ts`) implementa a mesma porta:

```ts
colocarProtecao(pedido: PedidoProtecao): Promise<ResultadoProtecao>; // trava a base; REJEITADA como a Binance recusaria
consultarProtecao(simbolo: string, ids: IdsProtecao): Promise<ResultadoProtecao | null>;
cancelarProtecao(simbolo: string, ids: IdsProtecao): Promise<ResultadoProtecao | null>; // devolve a base
saldoBloqueado(ativo: string): Valor; // base travada por proteções no livro (fora do saldo livre)
```

- O disparo acontece em `alimentar(simbolo, intervalo, candle)`, **antes** de o candle chegar a quem assina, e só para candles que terminam depois de a proteção existir. Alvo: máxima ≥ alvo executa no alvo. Stop: mínima ≤ stop dispara; executa no stop (ou na abertura, se abriu abaixo dele) menos o deslizamento, nunca abaixo do limite; abertura abaixo do limite deixa a venda esperando o preço voltar ao limite. Tocou os dois: vale o stop, a não ser que tenha aberto no alvo.
- Para o backtest usar o mesmo caminho do robô ao vivo: passe `protecoes: new ProtecoesMemoria(decisoes, ordens, relogio)` (`apps/motor/src/portas/memoria.ts`) nas `Dependencias` do `NucleoRobo` e alimente a corretora antes de entregar o candle ao núcleo. O patrimônio da curva precisa somar `saldoBloqueado(base)` ao saldo livre da base. Sem a porta, só o robô vigia (o comportamento de antes).
