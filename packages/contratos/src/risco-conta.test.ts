import { describe, expect, it } from "vitest";
import { AlertaEmitidoEsquema, AvisoEsquema } from "./alertas.js";
import { EventoEsquema } from "./eventos.js";
import {
  DivergenciaEsquema,
  LIMITES_CONTA_PADRAO,
  LimitesContaEsquema,
  SituacaoContaEsquema,
} from "./risco-conta.js";
import { AlertaEsquema } from "./webhook-esquemas.js";

describe("limites da conta", () => {
  it("o padrão (sem limites) é válido", () => {
    expect(LimitesContaEsquema.parse(LIMITES_CONTA_PADRAO)).toEqual(LIMITES_CONTA_PADRAO);
  });

  it("recusa limite zero, negativo ou em número JSON", () => {
    for (const ruim of ["0", "-10", 10]) {
      expect(
        LimitesContaEsquema.safeParse({ ...LIMITES_CONTA_PADRAO, perdaDiariaMaxima: ruim }).success,
      ).toBe(false);
    }
    expect(
      LimitesContaEsquema.safeParse({ ...LIMITES_CONTA_PADRAO, orcamentoIaMensalUsd: "20" }).success,
    ).toBe(true);
  });

  it("janelas e contagens têm faixas", () => {
    const fora = [
      { quedaJanelaHoras: 0 },
      { quedaJanelaHoras: 721 },
      { sequenciaStopsJanelaHoras: 169 },
      { sequenciaStopsMax: 0 },
      { posicoesAbertasMax: 0 },
      { sequenciaStopsEscopo: "tudo" },
    ];
    for (const f of fora)
      expect(LimitesContaEsquema.safeParse({ ...LIMITES_CONTA_PADRAO, ...f }).success).toBe(false);
  });

  it("situação da conta e divergência", () => {
    expect(
      SituacaoContaEsquema.safeParse({
        limites: LIMITES_CONTA_PADRAO,
        liberadaEm: null,
        redes: [],
        pausas: [
          { codigo: "conta_queda", rede: "testnet", roboId: null, motivo: "x", ate: 1, liberavel: true },
        ],
        orcamentoIa: {
          gastoMes: "1.5",
          gastoDia: "0.2",
          limiteMensal: "10",
          limiteDiario: null,
          uso: 0.15,
          esgotado: false,
        },
        em: 1,
      }).success,
    ).toBe(true);
    expect(
      DivergenciaEsquema.safeParse({
        id: "d1",
        rede: "papel",
        ativo: "BTC",
        esperado: "1",
        naCorretora: "0",
        falta: "1",
        estado: "aberta",
        detectadaEm: 1,
        atualizadaEm: 1,
        resolvidaEm: null,
        resolvidaPor: null,
        robos: [],
      }).success,
    ).toBe(false); // papel não tem corretora para conferir
  });
});

describe("alertas", () => {
  const alerta = {
    tipo: "robo_nao_ligou",
    gravidade: "critico",
    titulo: "Robô não ligou",
    mensagem: "A chave foi recusada.",
    chave: "robo_nao_ligou:r1",
    roboId: "r1",
    em: 1,
  } as const;

  it("o evento 'alerta' entra no canal de eventos", () => {
    expect(EventoEsquema.parse({ tipo: "alerta", alerta })).toEqual({ tipo: "alerta", alerta });
  });

  it("recusa tipo fora da lista e chave vazia", () => {
    expect(AlertaEmitidoEsquema.safeParse({ ...alerta, tipo: "outro" }).success).toBe(false);
    expect(AlertaEmitidoEsquema.safeParse({ ...alerta, chave: "" }).success).toBe(false);
  });

  it("aviso da tela e alerta do n8n (gravidade e chave opcionais)", () => {
    expect(
      AvisoEsquema.safeParse({
        id: "a1",
        tipo: "stop_atingido",
        gravidade: "atencao",
        titulo: "t",
        mensagem: "m",
        roboId: null,
        criadoEm: 1,
        lidoEm: null,
        enviado: true,
      }).success,
    ).toBe(true);
    expect(AlertaEsquema.safeParse({ tipo: "parada_total", titulo: "t", mensagem: "m", em: 1 }).success).toBe(
      true,
    );
    expect(
      AlertaEsquema.safeParse({ tipo: "x", titulo: "t", mensagem: "m", em: 1, gravidade: "grave" }).success,
    ).toBe(false);
  });
});
