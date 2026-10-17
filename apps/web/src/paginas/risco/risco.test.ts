import { LIMITES_CONTA_PADRAO, type SituacaoRede } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { demoRisco } from "./demo";
import { lerDinheiro, lerFormulario, paraFormulario } from "./formulario";
import { medidoresDaRede, medidoresDoOrcamento } from "./medidores";

const REDE: SituacaoRede = {
  rede: "testnet",
  robos: 2,
  realizadoDoDia: "-40",
  naoRealizado: "-10",
  perdaDoDia: "-50",
  exposicao: "900",
  posicoesAbertas: 3,
  queda: "20",
  pico: "100",
  saidasComPerda: 1,
};

describe("barras dos limites da conta", () => {
  it("compara cada número com o limite; sem limite, não há barra", () => {
    const m = medidoresDaRede(REDE, {
      ...LIMITES_CONTA_PADRAO,
      perdaDiariaMaxima: "100",
      exposicaoMaxima: "1000",
      posicoesAbertasMax: 3,
    });
    expect(m.map((x) => [x.id, x.valor, x.limite, x.nivel])).toEqual([
      ["perda", "50.00", "100", "ok"],
      ["exposicao", "900.00", "1000", "atencao"],
      ["posicoes", "3", "3", "limite"],
      ["queda", "20.00", null, "ok"],
      ["stops", "1", null, "ok"],
    ]);
    expect(m[0]?.rotulo).toBe("Perda do dia (realizada)");
  });

  it("ganho do dia conta como perda zero; orçamento mostra o dia só com teto diário", () => {
    const [perda] = medidoresDaRede({ ...REDE, perdaDoDia: "12" }, LIMITES_CONTA_PADRAO);
    expect(perda?.valor).toBe("0.00");
    const orc = {
      gastoMes: "8",
      gastoDia: "1",
      limiteMensal: "10",
      limiteDiario: null,
      uso: 0.8,
      esgotado: false,
    };
    expect(medidoresDoOrcamento(orc).map((x) => [x.id, x.nivel])).toEqual([["ia-mes", "atencao"]]);
    expect(medidoresDoOrcamento({ ...orc, limiteDiario: "1" }).map((x) => x.nivel)).toEqual([
      "atencao",
      "limite",
    ]);
  });
});

describe("formulário dos limites", () => {
  it("lê dinheiro com vírgula ou ponto; vazio é sem limite", () => {
    expect(lerDinheiro("1.500,50")).toBe("1500.50");
    expect(lerDinheiro(" 150 ")).toBe("150");
    expect(lerDinheiro("US$ 12.5")).toBe("12.5");
    expect(lerDinheiro("")).toBeNull();
    expect(lerDinheiro("0")).toBeUndefined();
    expect(lerDinheiro("abc")).toBeUndefined();
  });

  it("ida e volta sem perder nada", () => {
    const l = { ...LIMITES_CONTA_PADRAO, perdaDiariaMaxima: "150.5", sequenciaStopsMax: 3 };
    expect(lerFormulario(paraFormulario(l))).toEqual({ ok: true, limites: l });
  });

  it("diz o que corrigir, campo a campo, com as faixas da API", () => {
    const f = {
      ...paraFormulario(LIMITES_CONTA_PADRAO),
      quedaJanelaHoras: "0",
      posicoesAbertasMax: "x",
      exposicaoMaxima: "-1",
    };
    const r = lerFormulario(f);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.erros).sort()).toEqual([
      "exposicaoMaxima",
      "posicoesAbertasMax",
      "quedaJanelaHoras",
    ]);
    expect(r.erros.quedaJanelaHoras).toMatch(/1 a 720/);
  });
});

describe("conta de demonstração", () => {
  const agora = Date.UTC(2026, 9, 12, 15);

  it("mostra a pausa da sequência de stops e a divergência; liberar e aceitar mudam a tela", () => {
    const d = demoRisco(agora);
    expect(d.situacao(agora).pausas.map((p) => p.codigo)).toEqual([
      "sequencia_stops",
      "sequencia_stops_robo",
      "divergencia_saldo",
    ]);
    d.liberar(agora);
    expect(d.situacao(agora).pausas.map((p) => p.codigo)).toEqual(["divergencia_saldo"]);
    d.aceitar("div-sol", agora);
    expect(d.situacao(agora).pausas).toEqual([]);
    expect(d.reconciliar(agora).conferidas[0]?.divergentes).toBe(0);
  });

  it("apertar os limites cria pausas; o orçamento esgota com teto menor que o gasto", () => {
    const d = demoRisco(agora);
    d.salvarLimites({
      ...d.situacao(agora).limites,
      perdaDiariaMaxima: "50",
      quedaMaxima: "90",
      orcamentoIaMensalUsd: "20",
    });
    const s = d.situacao(agora);
    expect(s.pausas.map((p) => p.codigo)).toEqual(
      expect.arrayContaining(["conta_perda_diaria", "conta_queda", "orcamento_ia"]),
    );
    expect(s.orcamentoIa.esgotado).toBe(true);
  });

  it("marcar como lidos devolve quantos estavam novos", () => {
    const d = demoRisco(agora);
    expect(d.marcarLidos(agora)).toBe(3);
    expect(d.marcarLidos(agora)).toBe(0);
  });
});

describe("demonstração de Risco numa instalação nova", () => {
  it("vazia: limites padrão, sem redes, pausas, divergências nem avisos", () => {
    const d = demoRisco(Date.UTC(2026, 9, 10), { vazio: true });
    const s = d.situacao(Date.UTC(2026, 9, 10, 12));
    expect(s.limites).toEqual(LIMITES_CONTA_PADRAO);
    expect(s.redes).toEqual([]);
    expect(s.pausas).toEqual([]);
    expect(s.orcamentoIa.gastoMes).toBe("0");
    expect(d.divergencias()).toEqual([]);
    expect(d.avisos()).toEqual([]);
  });
});
