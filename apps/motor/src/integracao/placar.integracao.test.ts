import type { NovaDecisao, PropostaAgente } from "@zentrade/contratos";
import { calcularPlacar, dec, type Candle } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { avaliarPendentes, type DependenciasAvaliador } from "../placar/avaliador.js";
import { RelogioManual } from "../relogio.js";
import { registroDeTeste } from "../teste/cenario.js";
import { montarAmbiente, QUINZE, type AmbienteIntegracao } from "./ajuda.js";

const proposta = (acao: PropostaAgente["acao"], confianca: number): PropostaAgente => ({
  acao,
  confianca,
  tamanhoRelativo: 1,
  justificativa: "teste",
  riscos: [],
  fontes: [],
});

const T0 = Date.UTC(2026, 9, 10, 12, 0);
const vela = (i: number, o: number, h: number, l: number, c: number): Candle => ({
  abertura: T0 + i * QUINZE,
  fechamento: T0 + (i + 1) * QUINZE - 1,
  abre: dec(o),
  maxima: dec(h),
  minima: dec(l),
  fecha: dec(c),
  volume: dec(1),
});

describe("placar do Claude de ponta a ponta: decisões e candles no banco → avaliação → placar", () => {
  let a: AmbienteIntegracao;
  let deps: DependenciasAvaliador;
  const relogio = new RelogioManual(T0 + 4 * QUINZE);

  beforeAll(async () => {
    a = await montarAmbiente();
    deps = {
      placar: a.motorBanco.placar,
      candles: a.motorBanco.mercado,
      relogio,
      registro: registroDeTeste().registro,
    };
    // Sinal no candle 0 (fecha em 100). Depois: 1 parado, 2 toca o alvo (101,2 com 1% líquido e taxa).
    await a.motorBanco.mercado.gravar("BTCUSDT", "15m", [
      vela(0, 100, 100, 100, 100),
      vela(1, 100, 100.4, 99.6, 100.1),
      vela(2, 100.1, 102, 100, 101.5),
    ]);
    const decisao = (extra: Partial<NovaDecisao>): NovaDecisao => ({
      roboId: a.robo.id,
      em: T0 + QUINZE - 1,
      sinal: { acao: "COMPRAR", stop: dec(98), alvo: dec("101.2"), explicacao: "abaixo de 95" },
      preco: dec(100),
      risco: { aprovada: false, barreiras: [] },
      estado: "registrada",
      ...extra,
    });
    await a.motorBanco.portas.decisoes.registrar(decisao({ proposta: proposta("aguardar", 0.75) }));
    await a.motorBanco.portas.decisoes.registrar(
      decisao({ proposta: proposta("comprar", 0.85), quantidade: dec(2) }),
    );
  });
  afterAll(async () => a.encerrar());

  it("avalia as duas, grava, e uma segunda rodada não muda nada", async () => {
    const primeira = await avaliarPendentes(deps, { lote: 10, janelaDias: 30, revisarMs: 60_000 });
    expect(primeira).toEqual({ avaliadas: 2, concluidas: 2, falharam: 0 });
    relogio.avancar(10 * 60_000);
    const segunda = await avaliarPendentes(deps, { lote: 10, janelaDias: 30, revisarMs: 60_000 });
    expect(segunda).toEqual({ avaliadas: 0, concluidas: 0, falharam: 0 });

    const decisoes = await a.banco.decisoes.listar(a.usuarioId);
    const veto = decisoes.find((d) => d.proposta?.acao === "aguardar");
    const aprovacao = decisoes.find((d) => d.proposta?.acao === "comprar");
    expect(veto?.avaliacao).toMatchObject({
      claude: "vetou",
      fonte: "contrafactual",
      situacao: "concluida",
      motivo: "alvo",
      barras: 2,
      acertou: false,
      moeda: "USDT",
    });
    expect(aprovacao?.avaliacao).toMatchObject({ claude: "aprovou", motivo: "alvo", acertou: true });

    const placar = calcularPlacar(await a.banco.placar.decisoes(a.usuarioId));
    expect(placar.total).toMatchObject({ avaliadas: 2, moeda: "USDT" });
    expect(placar.total.aprovacoes).toMatchObject({ acertos: 1, total: 1 });
    expect(placar.total.vetos).toMatchObject({ acertos: 0, total: 1 });
    // o veto deixou passar o lucro que aprovar tudo teria dado
    expect(placar.total.dinheiro?.ganhosPerdidos.gt(0)).toBe(true);
    expect(placar.porRobo[0]?.nome).toBe("BTC papel");
  });
});
