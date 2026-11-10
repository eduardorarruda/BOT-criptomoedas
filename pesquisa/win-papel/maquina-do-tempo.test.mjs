// node --test pesquisa/win-papel/maquina-do-tempo.test.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  historicoDoSinal,
  minutoDoDia,
  percentualDaOperacao,
  placar,
  poolDeSessoes,
  sessoesParaBlocos,
  simularResto,
} from "./maquina-do-tempo.mjs";

const ms = (dia, hora) => Date.parse(`${dia}T${hora}:00-03:00`);
const op = (hora, sentido, resultado) => ({
  abertaEm: ms("2026-10-20", hora),
  sentido,
  contratos: 1,
  entrada: 200_000,
  resultado,
});

describe("placar da mesma regra", () => {
  it("resultado em % do valor negociado (1 contrato a 200.000 pontos = R$ 40.000)", () => {
    assert.equal(percentualDaOperacao(op("10:00", "comprado", 400)), 1);
  });

  it("conta as certas (lucro líquido > 0) e tira a média em %", () => {
    const p = placar([
      op("10:00", "comprado", 400),
      op("11:00", "vendido", -200),
      op("12:00", "comprado", 0),
    ]);
    assert.deepEqual(p, { operacoes: 3, certas: 1, resultadoMedio: 0.1667 });
  });

  it("recortes: mesma faixa de horário (±1 h) e mesmo lado", () => {
    const passadas = [
      op("10:00", "comprado", 400),
      op("10:50", "vendido", -200),
      op("15:00", "comprado", 200),
    ];
    const h = historicoDoSinal(
      passadas,
      { abertaEm: ms("2026-10-28", "10:30"), sentido: "comprado" },
      "teste",
    );
    assert.equal(h.total.operacoes, 3);
    assert.equal(h.mesmoHorario.operacoes, 2);
    assert.equal(h.mesmoLado.operacoes, 2);
    assert.equal(h.simulacao, undefined);
  });

  it("minuto do dia em Brasília", () => {
    assert.equal(minutoDoDia(ms("2026-10-28", "09:05")), 545);
  });
});

/** Uma sessão completa de 114 velas de 5 min, em que cada vela anda `passo` × o preço. */
function sessao(dia, passo) {
  const velas = [];
  let p = 200_000;
  for (let i = 0; i < 114; i++) {
    const abre = p;
    const fecha = p * (1 + passo);
    velas.push({
      abertura: ms(dia, "09:00") + i * 300_000,
      abre,
      maxima: Math.max(abre, fecha),
      minima: Math.min(abre, fecha),
      fecha,
    });
    p = fecha;
  }
  return velas;
}

describe("simulação do resto da sessão", () => {
  const base = { inicioMs: ms("2026-10-28", "10:00"), fimMs: ms("2026-10-28", "18:15"), entrada: 200_000 };

  it("mercado que só sobe: o comprado bate o alvo primeiro em todos os sorteios", () => {
    const pool = poolDeSessoes(sessao("2026-10-20", 0.001));
    const s = simularResto({
      ...base,
      pool,
      stop: 199_000,
      alvo: 201_000,
      sentido: "comprado",
      replays: 200,
    });
    assert.equal(s.alvoPrimeiro, 1);
    assert.equal(s.stopPrimeiro, 0);
    assert.equal(s.resultadoMedio, 0.5);
  });

  it("mercado que só cai: o comprado bate o stop; o vendido, o alvo", () => {
    const pool = poolDeSessoes(sessao("2026-10-20", -0.001));
    const c = simularResto({
      ...base,
      pool,
      stop: 199_000,
      alvo: 201_000,
      sentido: "comprado",
      replays: 100,
    });
    const v = simularResto({ ...base, pool, stop: 201_000, alvo: 199_000, sentido: "vendido", replays: 100 });
    assert.equal(c.stopPrimeiro, 1);
    assert.equal(v.alvoPrimeiro, 1);
  });

  it("as três frações somam 1, e a mesma semente repete o resultado", () => {
    const pool = poolDeSessoes([...sessao("2026-10-20", 0.0004), ...sessao("2026-10-21", -0.0004)]);
    const args = { ...base, pool, stop: 199_000, alvo: 201_000, sentido: "comprado", replays: 500 };
    const a = simularResto(args);
    assert.ok(Math.abs(a.alvoPrimeiro + a.stopPrimeiro + a.nenhum - 1) < 1e-9);
    assert.deepEqual(simularResto(args), a);
  });

  it("os custos de ida e volta saem do resultado", () => {
    const pool = poolDeSessoes(sessao("2026-10-20", 0.001));
    const s = simularResto({
      ...base,
      pool,
      stop: 199_000,
      alvo: 201_000,
      sentido: "comprado",
      replays: 50,
      custoPct: 0.1,
    });
    assert.equal(s.resultadoMedio, 0.4);
  });

  it("sessão incompleta não entra no sorteio; sem velas, devolve null", () => {
    const pool = poolDeSessoes(sessao("2026-10-20", 0.001).slice(0, 50));
    assert.equal(simularResto({ ...base, pool, stop: 1, alvo: 2, sentido: "comprado" }), null);
  });
});

describe("simulação por bloco de pregão inteiro (R4)", () => {
  const base = { inicioMs: ms("2026-10-28", "10:00"), fimMs: ms("2026-10-28", "18:15"), entrada: 200_000 };
  const velas = [...sessao("2026-10-20", 0.0005), ...sessao("2026-10-21", -0.0005)];
  const args = { ...base, stop: 198_000, alvo: 202_000, sentido: "comprado", replays: 400 };

  it("sorteio por vela mistura a alta com a queda e o preço fica parado: quase tudo 'nenhum'", () => {
    const s = simularResto({ ...args, pool: poolDeSessoes(velas) });
    assert.ok(s.nenhum > 0.9, `nenhum = ${s.nenhum}`);
  });

  it("sorteio por bloco preserva a tendência do dia: ou alvo ou stop, nunca 'nenhum'", () => {
    const s = simularResto({ ...args, blocos: sessoesParaBlocos(velas) });
    assert.equal(s.nenhum, 0);
    assert.ok(s.alvoPrimeiro > 0.3 && s.stopPrimeiro > 0.3, JSON.stringify(s));
    assert.deepEqual(simularResto({ ...args, blocos: sessoesParaBlocos(velas) }), s);
  });

  it("pregão que não cobre o horário pedido não entra no sorteio; sem nenhum, devolve null", () => {
    const curtas = sessoesParaBlocos(sessao("2026-10-20", 0.001).slice(0, 100));
    assert.equal(simularResto({ ...args, blocos: curtas }), null);
  });
});
