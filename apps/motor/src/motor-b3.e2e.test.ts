import type { RoboConfig } from "@zentrade/contratos";
import { CUSTOS_WIN_PADRAO, dec, type Candle, type Estrategia } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { RobosDoMercado } from "./b3/composicao-b3.js";
import { CorretoraB3Papel } from "./b3/corretora-b3-papel.js";
import { SIMBOLO_WIN_PAPEL } from "./b3/mercado.js";
import { OPCOES_PADRAO, type Dependencias } from "./nucleo/tipos.js";
import { AgenteFixo } from "./portas/agente-fixo.js";
import {
  AprovacaoMemoria,
  DecisoesMemoria,
  EventosMemoria,
  OrdensMemoria,
  RobosMemoria,
} from "./portas/memoria.js";
import { RelogioManual } from "./relogio.js";
import { RoboAoVivo } from "./robo.js";
import { registroDeTeste, USUARIO } from "./teste/cenario.js";
import { brasilia, CINCO_MIN, parada, pregao } from "./teste/win.js";

const ONTEM = "2026-11-09";
const HOJE = "2026-11-10";
const PONTOS = 180_000;
/** Entra sempre (a sessão decide quando); stop de 0,2% = 360 pontos. */
const SEMPRE: Estrategia = {
  entrada: {
    tipo: "comparar",
    esquerda: { tipo: "preco" },
    comparador: ">",
    direita: { tipo: "numero", valor: 0 },
  },
  stop: 0.002,
  alvoLiquido: 0.5,
  taxa: 0,
};

/** Um pregão inteiro parado no preço (09:00 a 18:20). */
const dia = (d: string) =>
  pregao(
    d,
    "09:00",
    Array.from({ length: 113 }, () => parada(PONTOS)),
  );

function montar() {
  const relogio = new RelogioManual(brasilia(HOJE, "08:00"));
  let velas: Candle[] = dia(ONTEM);
  const hoje = dia(HOJE);
  const corretora = new CorretoraB3Papel({
    fonte: { velas5m: async () => velas },
    capital: dec(120_000),
    margemPorContrato: dec(155),
    tarifaPorContrato: dec("0.25"),
    deslizamentoTicks: 1,
    contratosMaximos: 5,
    precoReferenciaPontos: PONTOS,
    idadeMaximaCotacaoMs: 7 * 60_000,
    consultaMs: 0,
    agora: () => relogio.agora(),
  });
  const robo: RoboConfig = {
    id: "win15",
    usuarioId: USUARIO,
    simbolo: SIMBOLO_WIN_PAPEL,
    intervalo: "15m",
    modo: "auto",
    rede: "papel",
    estrategia: SEMPRE,
    limites: {
      perdaDiariaMaxima: dec(900),
      exposicaoMaxima: dec(10_000_000),
      ordensPorHoraMax: 10,
      pausaAposPerdaMs: 0,
      confiancaMinima: 0.5,
    },
    riscoPorOperacao: dec(300),
  };
  const decisoes = new DecisoesMemoria();
  const ordens = new OrdensMemoria(relogio);
  const deps = {
    corretora,
    robos: new RobosDoMercado(new RobosMemoria([robo]), "b3"),
    decisoes,
    ordens,
    agente: new AgenteFixo("sempre_concorda"),
    eventos: new EventosMemoria(),
    aprovacao: new AprovacaoMemoria(() => undefined),
    relogio,
    registro: registroDeTeste().registro,
    dormir: relogio.dormir,
    opcoes: {
      ...OPCOES_PADRAO,
      agenteObrigatorio: false,
      tamanhoHistorico: 100,
      idadeMaximaSinalMs: 120_000,
      win: {
        simbolo: SIMBOLO_WIN_PAPEL,
        margemPorContrato: dec(155),
        contratosMaximos: 5,
        custos: CUSTOS_WIN_PADRAO,
      },
    },
  } satisfies Dependencias;
  return {
    deps,
    corretora,
    ordens,
    /** O EA escreve as velas de hoje até `hhmm` (inclusive) e o motor lê 10 s depois do fechamento. */
    async ate(hhmm: string, aoVivo: RoboAoVivo) {
      const limite = brasilia(HOJE, hhmm);
      velas = [...dia(ONTEM), ...hoje.filter((c) => c.abertura <= limite)];
      relogio.definir(limite + CINCO_MIN + 10_000);
      await corretora.atualizar();
      await aoVivo.ocioso();
    },
  };
}

describe("robô do WIN no papel da B3, pelo núcleo do motor (R1)", () => {
  it("pula o candle do leilão, compra em contratos pela perda no stop e zera no candle das 18:00", async () => {
    const m = montar();
    const [robo] = await m.deps.robos.ativos();
    if (!robo) throw new Error("o robô do WIN não foi ligado");
    const aoVivo = new RoboAoVivo(robo, m.deps);
    await aoVivo.iniciar();
    await m.corretora.atualizar();

    await m.ate("09:10", aoVivo); // fecha o candle das 09:00 (leilão): não entra
    expect(m.ordens.todas()).toHaveLength(0);

    await m.ate("09:25", aoVivo); // fecha o das 09:15: entra
    const [compra] = m.ordens.todas();
    expect(compra?.ordem.lado).toBe("COMPRA");
    // 360 pontos × R$ 0,20 = R$ 72 + R$ 2,50 de custos ida e volta = R$ 74,50 → ⌊300 ÷ 74,5⌋ = 4
    expect(compra?.ordem.quantidade.toString()).toBe("4");
    expect((await m.corretora.saldoLivre("WIN")).toString()).toBe("4");

    await m.ate("17:55", aoVivo);
    expect(m.ordens.todas()).toHaveLength(1);
    await m.ate("18:10", aoVivo); // fecha o das 18:00, que termina às 18:15: zera
    const [, venda] = m.ordens.todas();
    expect(venda?.ordem.lado).toBe("VENDA");
    expect((await m.corretora.saldoLivre("WIN")).toString()).toBe("0");
    await aoVivo.parar();
  });
});
