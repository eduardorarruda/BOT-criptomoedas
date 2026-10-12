import type { PortaRiscoConta } from "@zentrade/contratos";
import { dec, LIMITES_CONTA_LIVRES, type EstadoConta } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { riscoContaSeguro } from "./portas/risco-conta.js";
import { montarCenario, registroDeTeste, T0 } from "./teste/cenario.js";

const HORA = 3_600_000;

/** Conta com todos os limites estourados: nenhuma compra deve passar. */
const estourada = (agora: number): EstadoConta => ({
  limites: {
    ...LIMITES_CONTA_LIVRES,
    perdaDiariaMaxima: dec(10),
    exposicaoMaxima: dec(10),
    posicoesAbertasMax: 1,
    quedaMaxima: dec(5),
    sequenciaStopsMax: 1,
  },
  agora,
  realizadoDoDia: dec(-50),
  naoRealizado: dec(0),
  exposicao: dec(100),
  posicoesAbertas: 3,
  roboTemPosicao: false,
  resultados: [{ em: agora - HORA, delta: dec(-50) }],
  saidasComPerdaConta: [agora - HORA],
  saidasComPerdaRobo: [agora - HORA],
  liberadaEm: null,
  divergencias: [{ ativo: "BTC", falta: dec(1), detectadaEm: agora }],
});

const livre = (agora: number): EstadoConta => ({
  ...estourada(agora),
  limites: LIMITES_CONTA_LIVRES,
  divergencias: [],
});

/** Porta da conta que o teste troca no meio do cenário. */
class ContaTrocavel implements PortaRiscoConta {
  pedidos: string[] = [];
  constructor(public montar: (agora: number) => EstadoConta) {}
  async estado(roboId: string, agora: number): Promise<EstadoConta> {
    this.pedidos.push(roboId);
    return this.montar(agora);
  }
}

describe("limites da conta no motor", () => {
  it("barra a compra com os limites da conta e explica cada barreira", async () => {
    const conta = new ContaTrocavel(estourada);
    const c = montarCenario({ riscoConta: conta });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(0);
    const decisao = c.decisoes.todas().at(-1);
    expect(decisao?.estado).toBe("barrada");
    expect(decisao?.risco.barreiras.map((b) => b.codigo)).toEqual(
      expect.arrayContaining([
        "conta_perda_diaria",
        "conta_exposicao",
        "conta_posicoes",
        "conta_queda",
        "sequencia_stops",
        "divergencia_saldo",
      ]),
    );
    expect(conta.pedidos).toContain("r1");
    expect(c.eventos.doTipo("risco").map((e) => e.barreira.codigo)).toContain("conta_queda");
  });

  it("nunca segura o stop: com a conta estourada, a venda sai", async () => {
    const conta = new ContaTrocavel(livre);
    const c = montarCenario({ riscoConta: conta, agenteObrigatorio: true });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA"]);
    conta.montar = estourada;
    await c.fecharMinuto(92);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect(c.decisoes.todas().at(-1)?.estado).toBe("executada");
  });

  it("banco fora do ar: compra barrada com o motivo, stop segue", async () => {
    const conta = new ContaTrocavel(livre);
    const { registro, erros } = registroDeTeste();
    const segura = riscoContaSeguro(conta, registro);
    const c = montarCenario({ riscoConta: segura });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(1);
    conta.montar = () => {
      throw new Error("conexão recusada");
    };
    await c.fecharMinuto(92);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    await c.fecharIntervalo(94);
    const barrada = c.decisoes.todas().at(-1);
    expect(barrada?.estado).toBe("barrada");
    expect(barrada?.risco.barreiras[0]).toMatchObject({ codigo: "conta_indisponivel" });
    expect(barrada?.risco.barreiras[0]?.mensagem).toContain("conexão recusada");
    expect(erros.some((e) => /estado da conta indisponível/.test(e.msg))).toBe(true);
  });

  it("a porta segura repassa o estado quando o banco responde", async () => {
    const { registro } = registroDeTeste();
    const e = await riscoContaSeguro(new ContaTrocavel(livre), registro).estado("r1", T0);
    expect(e.indisponivel).toBeUndefined();
  });
});
