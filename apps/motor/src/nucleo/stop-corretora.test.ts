import type { RoboConfig } from "@zentrade/contratos";
import { PapelCorretora } from "@zentrade/corretora";
import { dec, type Candle, type Valor } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { AgenteFixo } from "../portas/agente-fixo.js";
import {
  AprovacaoMemoria,
  DecisoesMemoria,
  EventosMemoria,
  OrdensMemoria,
  ProtecoesMemoria,
  RobosMemoria,
} from "../portas/memoria.js";
import { RelogioManual } from "../relogio.js";
import { ESTRATEGIA, registroDeTeste, USUARIO } from "../teste/cenario.js";
import type { ProtecaoEfetiva } from "./posicao-aberta.js";
import { liberarProtecao, StopNaCorretora } from "./stop-corretora.js";
import { OPCOES_PADRAO, type Dependencias } from "./tipos.js";

const T0 = Date.UTC(2026, 9, 10, 12, 0);

const ROBO: RoboConfig = {
  id: "r1",
  usuarioId: USUARIO,
  simbolo: "BTCUSDT",
  intervalo: "15m",
  modo: "auto",
  rede: "papel",
  estrategia: ESTRATEGIA,
  limites: {
    perdaDiariaMaxima: dec(50),
    exposicaoMaxima: dec(1000),
    ordensPorHoraMax: 10,
    pausaAposPerdaMs: 0,
    confiancaMinima: 0.5,
  },
  riscoPorOperacao: dec(10),
};

const preco = (p: string): Candle => ({
  abertura: T0 - 60_000,
  fechamento: T0 - 1,
  abre: dec(p),
  maxima: dec(p),
  minima: dec(p),
  fecha: dec(p),
  volume: dec(1),
});

/** Papel com uma compra de `quantidade` BTC a 100 gravada nas portas, como o robô faria. */
async function montar(quantidade = "0.1") {
  const relogio = new RelogioManual(T0);
  const papel = new PapelCorretora({
    saldos: { USDT: dec(1000) },
    taxa: 0,
    deslizamentoBps: 0,
    agora: () => relogio.agora(),
  });
  papel.alimentar("BTCUSDT", "1m", preco("100"));
  const decisoes = new DecisoesMemoria();
  const ordens = new OrdensMemoria(relogio);
  const protecoes = new ProtecoesMemoria(decisoes, ordens, relogio);
  const { registro, erros } = registroDeTeste();
  const eventos = new EventosMemoria();
  const deps: Dependencias = {
    corretora: papel,
    robos: new RobosMemoria([ROBO]),
    decisoes,
    ordens,
    protecoes,
    agente: new AgenteFixo("sempre_concorda"),
    eventos,
    aprovacao: new AprovacaoMemoria(),
    relogio,
    registro,
    dormir: relogio.dormir,
    opcoes: OPCOES_PADRAO,
  };
  const decisaoId = await decisoes.registrar({
    roboId: "r1",
    em: T0,
    sinal: { acao: "COMPRAR", stop: dec(98), alvo: dec(103), explicacao: "teste" },
    preco: dec(100),
    risco: { aprovada: true, barreiras: [] },
    estado: "executada",
  });
  await ordens.reservar({
    decisaoId,
    roboId: "r1",
    idCliente: "c1",
    simbolo: "BTCUSDT",
    lado: "COMPRA",
    quantidade: dec(quantidade),
  });
  const compra = await papel.enviarOrdemMercado({
    simbolo: "BTCUSDT",
    lado: "COMPRA",
    quantidade: dec(quantidade),
    idCliente: "c1",
  });
  await ordens.concluir("c1", compra);
  let efetiva: ProtecaoEfetiva | null = { decisaoId, stop: dec("98.004"), alvo: dec("103.001") };
  const stop = new StopNaCorretora(ROBO, deps, () => Promise.resolve(efetiva));
  return {
    deps,
    papel,
    protecoes,
    eventos,
    erros,
    stop,
    decisaoId,
    definir: (e: ProtecaoEfetiva | null) => {
      efetiva = e;
    },
    ajustar: (p: string | Valor) => stop.ajustar(dec(p)),
  };
}

/** Uma venda gravada só nas portas (como uma venda feita por fora e registrada). */
async function venderNasPortas(m: Awaited<ReturnType<typeof montar>>, quantidade: string) {
  const idCliente = `v-${quantidade}`;
  await m.deps.ordens.reservar({
    decisaoId: m.decisaoId,
    roboId: "r1",
    idCliente,
    simbolo: "BTCUSDT",
    lado: "VENDA",
    quantidade: dec(quantidade),
  });
  await m.deps.ordens.concluir(idCliente, {
    idCliente,
    idCorretora: null,
    estado: "PREENCHIDA",
    execucoes: [{ lado: "VENDA", preco: dec(100), quantidade: dec(quantidade), taxaCotacao: dec(0), em: T0 }],
  });
}

describe("StopNaCorretora: a proteção no livro acompanha a posição", () => {
  it("arredonda no passo de preço sem piorar a proteção: stop e alvo para cima, limite para baixo", async () => {
    const m = await montar();
    await m.ajustar("100");
    const viva = await m.protecoes.viva("r1");
    expect(viva?.stop.toFixed()).toBe("98.01");
    expect(viva?.alvo?.toFixed()).toBe("103.01");
    expect(viva?.limite.toFixed()).toBe("97.02"); // 98,01 × 0,99 = 97,0299
    expect(viva?.quantidade.toFixed()).toBe("0.1");
  });

  it("ajustar de novo sem mudança não mexe no livro", async () => {
    const m = await montar();
    await m.ajustar("100");
    await m.ajustar("100.5");
    expect(m.protecoes.todas()).toHaveLength(1);
  });

  it("stop efetivo apertado: cancela a proteção e coloca a nova (uma viva só)", async () => {
    const m = await montar();
    await m.ajustar("100");
    m.definir({ decisaoId: m.decisaoId, stop: dec("99.5"), alvo: dec("103.001") });
    await m.ajustar("100.2");
    expect(m.protecoes.todas().map((p) => [p.estado, p.stop.toFixed()])).toEqual([
      ["CANCELADA", "98.01"],
      ["ATIVA", "99.5"],
    ]);
    expect(m.papel.saldoBloqueado("BTC").toFixed()).toBe("0.1");
  });

  it("alvo que o preço já passou: só o stop vai para o livro", async () => {
    const m = await montar();
    await m.ajustar("103.5");
    const viva = await m.protecoes.viva("r1");
    expect(viva?.alvo).toBeUndefined();
    expect(viva?.ids.alvo).toBeUndefined();
  });

  it("stop no preço ou acima: não coloca (a corretora recusaria; o robô vende no fechamento)", async () => {
    const m = await montar();
    await m.ajustar("98");
    expect(await m.protecoes.ultima("r1")).toBeNull();
  });

  it("poeira: não coloca e avisa uma vez só", async () => {
    const m = await montar();
    await venderNasPortas(m, "0.06"); // sobram 0,04: 0,04 × 97,02 = 3,88, abaixo dos 5 da corretora
    await m.ajustar("100");
    await m.ajustar("100");
    expect(await m.protecoes.ultima("r1")).toBeNull();
    const avisos = m.eventos.doTipo("risco").filter((e) => e.barreira.codigo === "poeira");
    expect(avisos).toHaveLength(1);
  });

  it("saldo livre menor que a posição: protege o que há e avisa", async () => {
    const m = await montar("0.2");
    await m.papel.enviarOrdemMercado({
      simbolo: "BTCUSDT",
      lado: "VENDA",
      quantidade: dec("0.06"),
      idCliente: "manual",
    });
    await m.ajustar("100");
    expect((await m.protecoes.viva("r1"))?.quantidade.toFixed()).toBe("0.14");
    expect(m.eventos.doTipo("risco").map((e) => e.barreira.codigo)).toContain("saldo");
  });

  it("posição zerada por fora com proteção no livro: tira a proteção", async () => {
    const m = await montar();
    await m.ajustar("100");
    await venderNasPortas(m, "0.1");
    await m.ajustar("100");
    expect(await m.protecoes.viva("r1")).toBeNull();
    expect(m.papel.saldoBloqueado("BTC").isZero()).toBe(true);
  });

  it("posição sem a compra no diário: avisa e não coloca", async () => {
    const m = await montar();
    m.definir(null);
    await m.ajustar("100");
    expect(await m.protecoes.ultima("r1")).toBeNull();
    expect(m.eventos.doTipo("risco").map((e) => e.barreira.codigo)).toContain("sem_compra");
  });

  it("falha ao colocar sem resposta: fica PENDENTE, sem lançar", async () => {
    const m = await montar();
    m.papel.colocarProtecao = () => Promise.reject(new Error("tempo esgotado"));
    await m.ajustar("100");
    expect((await m.protecoes.viva("r1"))?.estado).toBe("PENDENTE");
    expect(m.erros.some((e) => /colocar a proteção/.test(e.msg))).toBe(true);
    await m.ajustar("100"); // PENDENTE: quem resolve é a conferência
    expect(m.protecoes.todas()).toHaveLength(1);
  });

  it("liberar sem proteção viva é livre; com ela, cancela e destrava a base", async () => {
    const m = await montar();
    expect(await liberarProtecao(m.deps, ROBO)).toBe("livre");
    await m.ajustar("100");
    expect(await liberarProtecao(m.deps, ROBO)).toBe("livre");
    expect((await m.papel.saldoLivre("BTC")).toFixed()).toBe("0.1");
    expect((await m.protecoes.ultima("r1"))?.estado).toBe("CANCELADA");
  });
});
