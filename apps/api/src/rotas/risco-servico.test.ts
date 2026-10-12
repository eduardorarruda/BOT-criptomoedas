import type { DadosSituacaoConta, DivergenciaGravada, RetratoConta } from "@zentrade/banco";
import { LIMITES_CONTA_PADRAO, type LimitesContaDTO } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { afrouxa, ajustesDaFalta, orcamentoIaDTO, situacaoDaConta } from "./risco-servico.js";

const HORA = 3_600_000;
const AGORA = Date.UTC(2026, 9, 12, 15);

const retrato = (r: Partial<RetratoConta> = {}): RetratoConta => ({
  rede: "testnet",
  robos: [
    { id: "r1", nome: "BTC", simbolo: "BTCUSDT", quantidade: dec(0), precoMedio: dec(0) },
    { id: "r2", nome: "ETH", simbolo: "ETHUSDT", quantidade: dec(1), precoMedio: dec(50) },
  ],
  realizadoDoDia: dec(0),
  naoRealizado: dec(0),
  exposicao: dec(50),
  posicoesAbertas: 1,
  resultados: [],
  saidasComPerda: [],
  ...r,
});

const dados = (limites: Partial<LimitesContaDTO>, r: Partial<RetratoConta> = {}): DadosSituacaoConta => ({
  limites: { ...LIMITES_CONTA_PADRAO, ...limites },
  liberadaEm: null,
  retratos: [retrato(r)],
  orcamento: { gastoMes: dec(0), gastoDia: dec(0), limiteMensal: null, limiteDiario: null },
});

describe("situação da conta", () => {
  it("sem limites: números da rede e nenhuma pausa", () => {
    const s = situacaoDaConta(dados({}), [], AGORA);
    expect(s.pausas).toEqual([]);
    expect(s.redes[0]).toMatchObject({ rede: "testnet", robos: 2, exposicao: "50", posicoesAbertas: 1 });
    expect(s.orcamentoIa).toEqual({
      gastoMes: "0",
      gastoDia: "0",
      limiteMensal: null,
      limiteDiario: null,
      uso: null,
      esgotado: false,
    });
  });

  it("perda do dia no limite pausa até 00:00 UTC, sem liberar à mão", () => {
    const s = situacaoDaConta(dados({ perdaDiariaMaxima: "100" }, { realizadoDoDia: dec(-120) }), [], AGORA);
    expect(s.pausas).toEqual([
      expect.objectContaining({
        codigo: "conta_perda_diaria",
        rede: "testnet",
        ate: Date.UTC(2026, 9, 13),
        liberavel: false,
      }),
    ]);
    expect(s.redes[0]?.perdaDoDia).toBe("-120");
  });

  it("queda do pico e sequência de stops (conta e robô) pausam e podem ser liberadas", () => {
    const perdas = [
      { em: AGORA - 3 * HORA, roboId: "r1" },
      { em: AGORA - 2 * HORA, roboId: "r1" },
    ];
    const s = situacaoDaConta(
      dados(
        { quedaMaxima: "50", quedaJanelaHoras: 24, sequenciaStopsMax: 2, sequenciaStopsJanelaHoras: 6 },
        {
          resultados: [
            { em: AGORA - 5 * HORA, delta: dec(80) },
            { em: AGORA - 3 * HORA, delta: dec(-40) },
            { em: AGORA - 2 * HORA, delta: dec(-40) },
          ],
          saidasComPerda: perdas,
        },
      ),
      [],
      AGORA,
    );
    expect(s.pausas.map((p) => [p.codigo, p.roboId, p.ate, p.liberavel])).toEqual([
      ["conta_queda", null, AGORA + 19 * HORA, true],
      ["sequencia_stops", null, AGORA + 3 * HORA, true],
      ["sequencia_stops_robo", "r1", AGORA + 3 * HORA, true],
    ]);
    expect(s.redes[0]).toMatchObject({ queda: "80", pico: "80", saidasComPerda: 2 });
    expect(s.pausas[2]?.motivo).toMatch(/^BTC: /);
  });

  it("liberação manual tira o pico e as perdas anteriores", () => {
    const base = dados(
      { quedaMaxima: "50", sequenciaStopsMax: 1 },
      {
        resultados: [{ em: AGORA - 3 * HORA, delta: dec(-80) }],
        saidasComPerda: [{ em: AGORA - 3 * HORA, roboId: "r1" }],
      },
    );
    expect(situacaoDaConta(base, [], AGORA).pausas.length).toBeGreaterThan(0);
    expect(situacaoDaConta({ ...base, liberadaEm: AGORA - HORA }, [], AGORA).pausas).toEqual([]);
  });

  it("divergência aberta e orçamento de IA esgotado aparecem como pausas", () => {
    const divergencia: DivergenciaGravada = {
      id: "d1",
      rede: "testnet",
      ativo: "ETH",
      esperado: "1",
      naCorretora: "0.5",
      falta: "0.5",
      estado: "aberta",
      detectadaEm: 1,
      atualizadaEm: 1,
      resolvidaEm: null,
      resolvidaPor: null,
    };
    const d = {
      ...dados({}),
      orcamento: { gastoMes: dec(12), gastoDia: dec(1), limiteMensal: dec(10), limiteDiario: null },
    };
    const s = situacaoDaConta(d, [divergencia, { ...divergencia, id: "d2", estado: "aceita" }], AGORA);
    expect(s.pausas.map((p) => [p.codigo, p.rede, p.ate])).toEqual([
      ["divergencia_saldo", "testnet", null],
      ["orcamento_ia", null, Date.UTC(2026, 10, 1)],
    ]);
    expect(s.orcamentoIa).toMatchObject({ uso: 1.2, esgotado: true });
  });

  it("orçamento: o uso é o maior entre o mês e o dia", () => {
    expect(
      orcamentoIaDTO({ gastoMes: dec(2), gastoDia: dec(1), limiteMensal: dec(10), limiteDiario: dec(2) }).uso,
    ).toBe(0.5);
  });
});

describe("afrouxar limites pede reautenticação", () => {
  const atual: LimitesContaDTO = {
    ...LIMITES_CONTA_PADRAO,
    perdaDiariaMaxima: "100",
    sequenciaStopsMax: 3,
    incluirNaoRealizado: true,
  };

  it("apertar ou criar limite não afrouxa", () => {
    expect(afrouxa(atual, { ...atual, perdaDiariaMaxima: "50" })).toBe(false);
    expect(afrouxa(atual, { ...atual, exposicaoMaxima: "1000" })).toBe(false);
    expect(afrouxa(atual, { ...atual, quedaJanelaHoras: 100 })).toBe(false);
    expect(afrouxa(atual, atual)).toBe(false);
  });

  it("tirar, subir, encurtar janela, deixar de somar o não realizado ou estreitar o escopo afrouxa", () => {
    for (const mudanca of [
      { perdaDiariaMaxima: null },
      { perdaDiariaMaxima: "100.01" },
      { sequenciaStopsMax: 4 },
      { incluirNaoRealizado: false },
      { quedaJanelaHoras: 24 },
      { sequenciaStopsJanelaHoras: 12 },
      { sequenciaStopsEscopo: "robo" as const },
    ])
      expect(afrouxa(atual, { ...atual, ...mudanca })).toBe(true);
  });
});

describe("aceitar o saldo da corretora", () => {
  const robo = (id: string, q: string, pm: string) => ({
    id,
    nome: id,
    simbolo: "BTCUSDT",
    quantidade: dec(q),
    precoMedio: dec(pm),
  });

  it("baixa a falta da maior posição para a menor, ao preço médio de cada uma", () => {
    const ajustes = ajustesDaFalta(dec("0.5"), [
      robo("a", "0.2", "100"),
      robo("b", "0.4", "90"),
      robo("c", "0", "1"),
    ]);
    expect(ajustes.map((a) => [a.roboId, a.quantidade.toFixed(), a.preco.toFixed()])).toEqual([
      ["b", "0.4", "90"],
      ["a", "0.1", "100"],
    ]);
  });

  it("falta maior que as posições baixa tudo o que há", () => {
    const ajustes = ajustesDaFalta(dec(5), [robo("a", "1", "100")]);
    expect(ajustes.map((a) => a.quantidade.toFixed())).toEqual(["1"]);
  });
});
