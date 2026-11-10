// "Máquina do tempo" do pregão de papel do WIN (ideia adaptada da skill trader-timemachine,
// github.com/Jakeschincariol/day-trader-skill, licença MIT): antes de a IA opinar sobre um
// sinal, o código mede o que a MESMA regra fez no passado e sorteia o resto da sessão a
// partir das velas do próprio ativo. Funções puras, sem banco e sem rede.

const HORA_MS = 3_600_000;
const CINCO_MIN_MS = 300_000;
/** R$ por ponto do mini índice. */
export const VALOR_PONTO = 0.2;
/** Entradas a até 1 h do horário do sinal contam como "mesma faixa de horário". */
export const JANELA_HORARIO_MIN = 60;
/** Só sessões quase completas (o pregão do WIN tem ~114 velas de 5 min) entram no sorteio. */
const VELAS_MINIMAS_SESSAO = 100;

/** Minuto do dia em Brasília (UTC−3, sem horário de verão desde 2019). */
export const minutoDoDia = (ms) => {
  const d = new Date(ms - 3 * HORA_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const diaB3 = (ms) => new Date(ms - 3 * HORA_MS).toISOString().slice(0, 10);
const arred = (x, casas = 4) => Math.round(x * 10 ** casas) / 10 ** casas;

/** Resultado líquido da operação em % do valor negociado (contratos × preço × R$ 0,20). */
export function percentualDaOperacao(o) {
  const negociado = o.contratos * o.entrada * VALOR_PONTO;
  return negociado > 0 ? (o.resultado / negociado) * 100 : 0;
}

/** Placar de uma lista de operações: quantas, quantas com lucro líquido e o resultado médio em %. */
export function placar(ops) {
  const certas = ops.filter((o) => o.resultado > 0).length;
  const media = ops.length ? ops.reduce((s, o) => s + percentualDaOperacao(o), 0) / ops.length : 0;
  return { operacoes: ops.length, certas, resultadoMedio: arred(media) };
}

/**
 * O histórico da mesma regra para um sinal: placar total, na mesma faixa de horário
 * (±1 h da entrada) e no mesmo lado; mais a simulação, se vier.
 */
export function historicoDoSinal(opsPassadas, sinal, fonte, simulacao) {
  const minuto = minutoDoDia(sinal.abertaEm);
  const mesmoHorario = opsPassadas.filter(
    (o) => Math.abs(minutoDoDia(o.abertaEm) - minuto) <= JANELA_HORARIO_MIN,
  );
  const mesmoLado = opsPassadas.filter((o) => o.sentido === sinal.sentido);
  return {
    fonte,
    total: placar(opsPassadas),
    ...(mesmoHorario.length ? { mesmoHorario: placar(mesmoHorario) } : {}),
    ...(mesmoLado.length ? { mesmoLado: placar(mesmoLado) } : {}),
    ...(simulacao ? { simulacao } : {}),
  };
}

/**
 * O "baralho" do sorteio: cada vela de 5 min das sessões completas vira quatro razões
 * sobre o fechamento anterior (abertura, máxima, mínima, fechamento), guardadas pelo
 * minuto do dia em que aconteceu.
 */
/** As velas de 5 min agrupadas por pregão (dia da B3), em ordem. */
function porDiaB3(velas5m) {
  const porDia = new Map();
  for (const v of velas5m) {
    const d = diaB3(v.abertura);
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d).push(v);
  }
  return porDia;
}

/** As quatro razões de uma vela sobre o fechamento anterior: abertura, máxima, mínima, fechamento. */
const razoes = (anterior, v) => {
  const base = Number(anterior.fecha);
  return [Number(v.abre) / base, Number(v.maxima) / base, Number(v.minima) / base, Number(v.fecha) / base];
};

/**
 * Os blocos do sorteio por pregão inteiro (R4): cada sessão completa vira um mapa
 * minuto do dia → razões. Sortear um pregão inteiro, e não vela por vela, preserva a
 * tendência e o agrupamento de volatilidade do dia — o que a estratégia de tendência explora.
 */
export function sessoesParaBlocos(velas5m) {
  const blocos = [];
  for (const velas of porDiaB3(velas5m).values()) {
    if (velas.length < VELAS_MINIMAS_SESSAO) continue;
    const bloco = new Map();
    for (let i = 1; i < velas.length; i++) bloco.set(minutoDoDia(velas[i].abertura), razoes(velas[i - 1], velas[i]));
    blocos.push(bloco);
  }
  return blocos;
}

export function poolDeSessoes(velas5m) {
  const pool = new Map();
  for (const velas of porDiaB3(velas5m).values()) {
    if (velas.length < VELAS_MINIMAS_SESSAO) continue;
    for (let i = 1; i < velas.length; i++) {
      const slot = minutoDoDia(velas[i].abertura);
      if (!pool.has(slot)) pool.set(slot, []);
      pool.get(slot).push(razoes(velas[i - 1], velas[i]));
    }
  }
  return pool;
}

/** Gerador determinístico (mulberry32): mesma semente, mesmos sorteios. */
function gerador(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** As razões candidatas de um horário: o slot e os vizinhos (± `janela` velas de 5 min). */
function candidatas(pool, slot, janela) {
  const lista = [];
  for (let d = -janela; d <= janela; d++) lista.push(...(pool.get(slot + d * 5) ?? []));
  return lista;
}

/**
 * Quem sorteia a próxima vela: `porVela` escolhe, para cada horário, uma vela passada do
 * mesmo horário (± `janela`); `porBloco` escolhe um pregão passado inteiro e segue as
 * velas dele. Devolve null se não há velas para cobrir os horários.
 */
function sorteadorPorVela(pool, minutos, janela, sorteio) {
  const slots = minutos.map((m) => candidatas(pool, m, janela));
  if (slots.length === 0 || slots.some((c) => c.length === 0)) return null;
  return () => slots.map((c) => c[Math.floor(sorteio() * c.length)]);
}

function sorteadorPorBloco(blocos, minutos, sorteio) {
  const cobrem = blocos.filter((b) => minutos.every((m) => b.has(m)));
  if (minutos.length === 0 || cobrem.length === 0) return null;
  return () => {
    const b = cobrem[Math.floor(sorteio() * cobrem.length)];
    return minutos.map((m) => b.get(m));
  };
}

/** Um caminho de velas a partir da entrada: o stop antes do alvo (os dois na mesma vela = stop). */
function percorrer(caminho, { entrada, stop, alvo, comprado }) {
  let preco = entrada;
  for (const [, alta, baixa, fecha] of caminho) {
    const max = preco * alta;
    const min = preco * baixa;
    if (comprado ? min <= stop : max >= stop) return { fim: stop, saida: "stop" };
    if (comprado ? max >= alvo : min <= alvo) return { fim: alvo, saida: "alvo" };
    preco *= fecha;
  }
  return { fim: preco, saida: "nenhum" };
}

/**
 * Sorteia o resto da sessão `replays` vezes a partir da entrada, até `fimMs`, na escala do
 * preço. Com `blocos` (sessoesParaBlocos), cada sorteio é um pregão passado inteiro (R4);
 * senão, vela por vela do `pool` (poolDeSessoes). Resultado em % da entrada, menos
 * `custoPct` (os custos de ida e volta). Sem velas para algum horário, devolve null.
 */
export function simularResto({
  pool,
  blocos,
  inicioMs,
  fimMs,
  entrada,
  stop,
  alvo,
  sentido,
  custoPct = 0,
  replays = 2000,
  semente = 19,
  janela = 2,
}) {
  const minutos = [];
  for (let t = inicioMs; t < fimMs; t += CINCO_MIN_MS) minutos.push(minutoDoDia(t));
  const sorteio = gerador(semente);
  const caminho = blocos
    ? sorteadorPorBloco(blocos, minutos, sorteio)
    : sorteadorPorVela(pool, minutos, janela, sorteio);
  if (!caminho) return null;
  const comprado = sentido === "comprado";
  const conta = { alvo: 0, stop: 0, nenhum: 0 };
  let soma = 0;
  for (let r = 0; r < replays; r++) {
    const { fim, saida } = percorrer(caminho(), { entrada, stop, alvo, comprado });
    conta[saida]++;
    soma += ((comprado ? fim - entrada : entrada - fim) / entrada) * 100 - custoPct;
  }
  const a = arred(conta.alvo / replays);
  const s = arred(conta.stop / replays);
  return {
    replays,
    alvoPrimeiro: a,
    stopPrimeiro: s,
    nenhum: arred(1 - a - s),
    resultadoMedio: arred(soma / replays),
  };
}
