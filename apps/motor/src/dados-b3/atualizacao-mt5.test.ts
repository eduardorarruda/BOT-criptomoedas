import { describe, expect, it } from "vitest";
import { bancoDeCandlesFalso } from "../teste/banco-candles.js";
import { fonteBarrasMt5Falsa } from "../teste/fonte-mt5-falsa.js";
import {
  criarAgendadorMt5,
  processarAtualizacaoMt5,
  type CredenciaisParaAtualizar,
  type DependenciasAtualizacaoDiaria,
} from "./atualizacao-mt5.js";
import { meiaNoiteB3 } from "./comandos.js";

const DIA = "2026-10-14";
const ABERTURA = meiaNoiteB3(DIA) + 9 * 3_600_000;
const AGORA = ABERTURA + 2 * 3_600_000;
const SENHA = "senha-super-secreta";
const CONTA: CredenciaisParaAtualizar = {
  servidor: "Clear-Demo",
  login: "1234567",
  senha: SENHA,
  simboloContinuo: null,
  fusoServidor: "+03:00",
};

function montar(
  o: { conta?: CredenciaisParaAtualizar | null; coletor?: boolean; ultima?: number | null } = {},
) {
  const chamadas: string[] = [];
  const b = bancoDeCandlesFalso();
  const { fonte, pedidos } = fonteBarrasMt5Falsa({
    simbolos: ["WIN$N"],
    barras: [0, 5].map((m) => ({
      tempoServidorNaive: ABERTURA + 3 * 3_600_000 + m * 60_000,
      abre: "1",
      maxima: "1",
      minima: "1",
      fecha: "1",
      volume: "1",
    })),
  });
  const d: DependenciasAtualizacaoDiaria = {
    banco: b.banco,
    repositorio: {
      obterParaProcessar: async (id) => (id === "sumiu" ? null : { usuarioId: "u1" }),
      marcarLendo: async (id) => void chamadas.push(`lendo:${id}`),
      concluir: async (id, r) => void chamadas.push(`concluida:${id}:${r.dias.length}`),
      falhar: async (id, e) => void chamadas.push(`falhou:${id}:${e}`),
    },
    credenciais: async () => (o.conta === undefined ? CONTA : o.conta),
    ultimaVela: async () => (o.ultima === undefined ? null : o.ultima),
    criarFonte: () => fonte,
    agora: () => AGORA,
    historicoDias: 730,
    coletorConfigurado: o.coletor ?? true,
  };
  return { d, chamadas, pedidos, b };
}

describe("processarAtualizacaoMt5", () => {
  it("na primeira vez pede o máximo de histórico; grava e conclui com o resumo por dia", async () => {
    const { d, chamadas, pedidos, b } = montar();
    await processarAtualizacaoMt5(d, "i1");
    expect(chamadas).toEqual(["lendo:i1", "concluida:i1:1"]);
    expect(pedidos[0]?.de).toBe(meiaNoiteB3("2024-10-14"));
    expect(b.de("WIN", "5m").map((k) => k.abertura)).toEqual([ABERTURA, ABERTURA + 300_000]);
  });

  it("depois, pede desde a última vela gravada (início do dia)", async () => {
    const { d, pedidos } = montar({ ultima: ABERTURA + 3_600_000 });
    await processarAtualizacaoMt5(d, "i1");
    expect(pedidos[0]?.de).toBe(meiaNoiteB3(DIA));
  });

  it("sem coletor ou sem conta: falha com a explicação, sem tocar no coletor", async () => {
    const a = montar({ coletor: false });
    await processarAtualizacaoMt5(a.d, "i1");
    expect(a.chamadas[1]).toMatch(/^falhou:i1:o coletor do MetaTrader 5 não está ligado/);
    const b = montar({ conta: null });
    await processarAtualizacaoMt5(b.d, "i1");
    expect(b.chamadas[1]).toMatch(/Contas e chaves/);
    expect(b.pedidos).toEqual([]);
  });

  it("o erro gravado nunca leva a senha", async () => {
    const m = montar();
    const d = {
      ...m.d,
      criarFonte: () => ({
        simbolosWin: async () => {
          throw new Error(`login recusado (${SENHA})`);
        },
        barras: async () => [],
      }),
    };
    await processarAtualizacaoMt5(d, "i1");
    expect(m.chamadas[1]).toContain("login recusado ([oculto])");
    expect(m.chamadas.join()).not.toContain(SENHA);
  });

  it("linha que não existe mais: não faz nada", async () => {
    const { d, chamadas } = montar();
    await processarAtualizacaoMt5(d, "sumiu");
    expect(chamadas).toEqual([]);
  });
});

describe("agendador diário do MT5", () => {
  const em = (dia: number, hora: number, min = 0) => Date.UTC(2026, 9, dia, hora + 3, min); // Brasília
  function agendar(inicial: number) {
    const r = { t: inicial, execucoes: 0 };
    const a = criarAgendadorMt5({ agora: () => r.t, hora: 19, executar: async () => void r.execucoes++ });
    return { r, a };
  }

  it("não roda antes das 19h; roda uma vez depois, uma vez por dia", async () => {
    const { r, a } = agendar(em(14, 18, 59)); // quarta
    expect(await a.tick()).toBe(false);
    r.t = em(14, 19, 0);
    expect(await a.tick()).toBe(true);
    r.t = em(14, 22, 0);
    expect(await a.tick()).toBe(false);
    r.t = em(15, 19, 1);
    expect(await a.tick()).toBe(true);
    expect(r.execucoes).toBe(2);
  });

  it("não roda no fim de semana", async () => {
    const { a } = agendar(em(17, 20)); // sábado
    expect(await a.tick()).toBe(false);
  });
});
