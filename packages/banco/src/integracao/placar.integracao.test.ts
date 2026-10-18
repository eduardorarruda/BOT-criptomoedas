import type { NovaDecisao, PropostaAgente } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoUsuario } from "../cliente.js";
import { avaliacoesDecisao } from "../esquema/index.js";
import { portaPlacar } from "../portas/placar.js";
import { montarCenario, type Cenario } from "./ajuda.js";

const proposta = (acao: PropostaAgente["acao"], confianca: number): PropostaAgente => ({
  acao,
  confianca,
  tamanhoRelativo: 1,
  justificativa: acao === "comprar" ? "rompimento com volume" : "volume fraco",
  riscos: [],
  fontes: [],
});

describe("placar do Claude no banco: candidatas, gravação idempotente e leitura sob RLS", () => {
  let c: Cenario;
  let porta: ReturnType<typeof portaPlacar>;
  const t0 = Date.UTC(2026, 9, 10, 12, 0);
  const ids: Record<string, string> = {};

  const decisao = (roboId: string, extra: Partial<NovaDecisao>): NovaDecisao => ({
    roboId,
    em: t0,
    sinal: { acao: "COMPRAR", stop: dec("98"), alvo: dec("102"), explicacao: "rompeu" },
    preco: dec("100"),
    risco: { aprovada: true, barreiras: [] },
    estado: "registrada",
    ...extra,
  });

  beforeAll(async () => {
    c = await montarCenario();
    porta = portaPlacar(c.banco.conexao.db);
    const d = c.banco.portas.decisoes;
    const ana = c.ana.robo.id;
    ids.aprovada = await d.registrar(
      decisao(ana, {
        proposta: proposta("comprar", 0.8),
        quantidade: dec("0.5"),
        protecao: { stop: dec("98.5"), alvo: dec("101.5") },
      }),
    );
    ids.vetada = await d.registrar(decisao(ana, { em: t0 + 1000, proposta: proposta("aguardar", 0.7) }));
    ids.semAgente = await d.registrar(decisao(ana, { em: t0 + 2000 }));
    ids.venda = await d.registrar(
      decisao(ana, {
        em: t0 + 3000,
        sinal: { acao: "VENDER", motivo: "regra de saída", explicacao: "saiu" },
        proposta: proposta("vender", 0.9),
      }),
    );
    ids.executada = await d.registrar(
      decisao(ana, { em: t0 + 4000, proposta: proposta("comprar", 0.9), quantidade: dec("1") }),
    );
    await d.mudarEstado(ids.executada, "executada");
    await d.registrarDesfecho(ids.executada, dec("-1.25"), t0 + 9000);
    ids.beto = await d.registrar(decisao(c.beto.robo.id, { proposta: proposta("comprar", 0.6) }));
  });
  afterAll(async () => c.encerrar());

  it("candidatas: só entradas com proposta, de todas as pessoas, com a estratégia e o resultado real", async () => {
    const lista = await porta.candidatas({ desde: t0 - 1, revisarAntesDe: t0, limite: 50 });
    expect(lista.map((x) => x.decisaoId).sort()).toEqual(
      [ids.aprovada, ids.vetada, ids.executada, ids.beto].sort(),
    );
    const aprovada = lista.find((x) => x.decisaoId === ids.aprovada)!;
    expect(aprovada).toMatchObject({
      usuarioId: c.ana.id,
      simbolo: "BTCUSDT",
      intervalo: "1h",
      em: t0,
      estado: "registrada",
      resultadoReal: null,
    });
    expect(aprovada.proposta.confianca).toBe(0.8);
    expect(aprovada.quantidade?.toFixed()).toBe("0.5");
    expect(aprovada.protecao?.stop.toFixed()).toBe("98.5");
    expect(aprovada.estrategia).toMatchObject({ stop: 0.02, alvoLiquido: 0.01, taxa: 0.001 });
    expect(aprovada.riscoPorOperacao.toFixed()).toBe("10");
    expect(aprovada.exposicaoMaxima.toFixed()).toBe("1000");
    const real = lista.find((x) => x.decisaoId === ids.executada)!;
    expect(real.resultadoReal?.toFixed()).toBe("-1.25");
    expect(lista.find((x) => x.decisaoId === ids.vetada)?.quantidade).toBeNull();
  });

  it("desde e limite recortam a lista", async () => {
    const lista = await porta.candidatas({ desde: t0 + 1000, revisarAntesDe: t0, limite: 1 });
    expect(lista.map((x) => x.decisaoId)).toEqual([ids.vetada]);
  });

  it("pendente volta só depois do tempo de revisão; concluída nunca é reescrita", async () => {
    await porta.gravar({
      decisaoId: ids.vetada!,
      usuarioId: c.ana.id,
      claude: "vetou",
      confianca: 0.7,
      fonte: "contrafactual",
      situacao: "pendente",
      barras: 3,
      moeda: "USDT",
      em: t0 + 60_000,
    });
    const cedo = await porta.candidatas({ desde: t0 - 1, revisarAntesDe: t0 + 30_000, limite: 50 });
    expect(cedo.map((x) => x.decisaoId)).not.toContain(ids.vetada);
    const tarde = await porta.candidatas({ desde: t0 - 1, revisarAntesDe: t0 + 90_000, limite: 50 });
    // As nunca avaliadas vêm antes das pendentes.
    expect(tarde.at(-1)?.decisaoId).toBe(ids.vetada);

    const concluida = {
      decisaoId: ids.vetada!,
      usuarioId: c.ana.id,
      claude: "vetou" as const,
      confianca: 0.7,
      fonte: "contrafactual" as const,
      situacao: "concluida" as const,
      motivo: "stop" as const,
      quantidade: dec("4.9"),
      precoEntrada: dec("100.07"),
      precoSaida: dec("97.99"),
      resultado: dec("-10.2"),
      retorno: -0.0208,
      barras: 7,
      moeda: "USDT",
      em: t0 + 120_000,
    };
    await porta.gravar(concluida);
    await porta.gravar({ ...concluida, situacao: "pendente", resultado: dec(5), em: t0 + 180_000 });
    const depois = await porta.candidatas({ desde: t0 - 1, revisarAntesDe: t0 + 999_999, limite: 50 });
    expect(depois.map((x) => x.decisaoId)).not.toContain(ids.vetada);

    const lista = await c.banco.decisoes.listar(c.ana.id);
    const item = lista.find((x) => x.id === ids.vetada);
    expect(item?.avaliacao).toEqual({
      claude: "vetou",
      confianca: 0.7,
      fonte: "contrafactual",
      situacao: "concluida",
      motivo: "stop",
      resultado: "-10.2",
      retorno: -0.0208,
      barras: 7,
      acertou: true,
      moeda: "USDT",
      avaliadaEm: t0 + 120_000,
    });
    expect((await c.banco.decisoes.obter(c.ana.id, ids.vetada!))?.avaliacao?.acertou).toBe(true);
    expect(lista.find((x) => x.id === ids.semAgente)?.avaliacao).toBeUndefined();
  });

  it("decisões do placar: só as da pessoa (RLS), com o veredito da proposta e pendentes sem resultado", async () => {
    const ana = await c.banco.placar.decisoes(c.ana.id);
    expect(ana.map((d) => d.id).sort()).toEqual([ids.aprovada, ids.vetada, ids.executada].sort());
    const vetada = ana.find((d) => d.id === ids.vetada)!;
    expect(vetada).toMatchObject({
      claude: "vetou",
      confianca: 0.7,
      moeda: "USDT",
      mercado: "cripto",
      roboNome: "BTC devagar",
      estrategiaNome: "Cruzamento de médias",
      retorno: -0.0208,
    });
    expect(vetada.resultado?.toFixed()).toBe("-10.2");
    const aprovada = ana.find((d) => d.id === ids.aprovada)!;
    expect(aprovada).toMatchObject({ claude: "aprovou", confianca: 0.8, resultado: null, retorno: null });

    const beto = await c.banco.placar.decisoes(c.beto.id);
    expect(beto.map((d) => d.id)).toEqual([ids.beto]);
    expect(await c.banco.placar.decisoes(c.ana.id, { roboId: c.beto.robo.id })).toEqual([]);
    expect((await c.banco.placar.decisoes(c.ana.id, { desde: t0 + 500 })).map((d) => d.id).sort()).toEqual(
      [ids.vetada, ids.executada].sort(),
    );
  });

  it("a aplicação só lê: gravar avaliação como pessoa é recusado", async () => {
    await expect(
      comoUsuario(c.banco.conexao.db, c.ana.id, (tx) =>
        tx.insert(avaliacoesDecisao).values({
          decisaoId: ids.aprovada!,
          usuarioId: c.ana.id,
          claude: "aprovou",
          confianca: "0.8",
          fonte: "contrafactual",
          situacao: "pendente",
          moeda: "USDT",
        }),
      ),
    ).rejects.toThrow();
  });
});
