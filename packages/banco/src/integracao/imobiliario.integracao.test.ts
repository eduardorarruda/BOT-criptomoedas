import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoUsuario } from "../cliente.js";
import { investimentosImobiliarios, lancamentosImobiliarios } from "../esquema/index.js";
import { montarCenario, type Cenario } from "./ajuda.js";

describe("investimentos imobiliários no banco", () => {
  let c: Cenario;
  let apartamentoId: string;

  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  it("cria com financiamento e lançamentos iniciais, tudo em NUMERIC", async () => {
    const r = await c.banco.imobiliario.criar(c.ana.id, {
      tipo: "aluguel",
      nome: "Apto Centro",
      valorizacaoAnual: 0.045,
      taxaAdministracao: 0.08,
      financiamento: {
        sistema: "SAC",
        valorFinanciado: "320000.10",
        taxaAnual: 0.1049,
        prazoMeses: 360,
        primeiraParcela: "2026-02-10",
        seguroTaxaMensalSaldo: 0.00025,
        seguroFixoMensal: "31.5",
      },
      lancamentosIniciais: [
        { data: "2026-01-10", tipo: "aporte", categoria: "entrada", valor: "80000" },
        { data: "2026-01-12", tipo: "aporte", categoria: "itbi", valor: "12000.55" },
      ],
    });
    apartamentoId = r.investimento.id;
    expect(r.investimento).toMatchObject({
      tipo: "aluguel",
      moeda: "BRL",
      valorizacaoAnual: 0.045,
      taxaAdministracao: 0.08,
      valorAtual: null,
      financiamento: {
        sistema: "SAC",
        valorFinanciado: "320000.1",
        taxaAnual: 0.1049,
        seguroTaxaMensalSaldo: 0.00025,
        seguroFixoMensal: "31.5",
      },
    });
    expect(r.lancamentos.map((l) => [l.data, l.categoria, l.valor])).toEqual([
      ["2026-01-10", "entrada", "80000"],
      ["2026-01-12", "itbi", "12000.55"],
    ]);
    const [tipo] = await c.banco.conexao
      .sql`select pg_typeof(valor)::text as t from lancamentos_imobiliarios limit 1`;
    expect(tipo?.t).toBe("numeric");
  });

  it("atualiza só o enviado, limpa com null e troca o financiamento", async () => {
    const r = await c.banco.imobiliario.atualizar(c.ana.id, apartamentoId, {
      valorAtual: "450000",
      valorAtualEm: "2026-06-01",
      valorizacaoAnual: null,
      financiamento: null,
    });
    expect(r.investimento).toMatchObject({
      valorAtual: "450000",
      valorizacaoAnual: null,
      financiamento: null,
    });
    expect(r.investimento.nome).toBe("Apto Centro");
    expect(r.investimento.atualizadoEm).toBeGreaterThanOrEqual(r.investimento.criadoEm);
  });

  it("recusa mudança que quebra a regra do tipo", async () => {
    const fii = await c.banco.imobiliario.criar(c.ana.id, {
      tipo: "fii",
      nome: "Logística",
      ticker: "HGLG11",
    });
    await expect(
      c.banco.imobiliario.atualizar(c.ana.id, fii.investimento.id, { ticker: null }),
    ).rejects.toMatchObject({
      codigo: "invalido",
    });
    await expect(
      c.banco.imobiliario.criar(c.ana.id, { tipo: "reit", nome: "Sem moeda", ticker: "O" }),
    ).rejects.toMatchObject({ codigo: "invalido" });
  });

  it("lançamentos: adiciona, valida na transação (desfaz se a conferência falhar) e remove", async () => {
    const novo = await c.banco.imobiliario.adicionarLancamento(c.ana.id, apartamentoId, {
      data: "2026-03-05",
      tipo: "receita",
      categoria: "aluguel",
      valor: "2500",
    });
    expect(novo).toMatchObject({ tipo: "receita", valor: "2500", quantidade: null, descricao: null });

    await expect(
      c.banco.imobiliario.adicionarLancamento(
        c.ana.id,
        apartamentoId,
        { data: "2026-03-06", tipo: "despesa", categoria: "iptu", valor: "100" },
        () => {
          throw new Error("conferência recusou");
        },
      ),
    ).rejects.toThrow("conferência recusou");
    expect((await c.banco.imobiliario.obter(c.ana.id, apartamentoId))!.lancamentos).toHaveLength(3);

    await c.banco.imobiliario.removerLancamento(c.ana.id, apartamentoId, novo.id);
    await expect(
      c.banco.imobiliario.removerLancamento(c.ana.id, apartamentoId, novo.id),
    ).rejects.toMatchObject({ codigo: "nao_encontrado" });
  });

  it("RLS: outra pessoa não vê, não lança e não apaga", async () => {
    expect(await c.banco.imobiliario.obter(c.beto.id, apartamentoId)).toBeNull();
    expect(await c.banco.imobiliario.listar(c.beto.id)).toEqual([]);
    await expect(
      c.banco.imobiliario.adicionarLancamento(c.beto.id, apartamentoId, {
        data: "2026-03-05",
        tipo: "receita",
        categoria: "aluguel",
        valor: "1",
      }),
    ).rejects.toMatchObject({ codigo: "nao_encontrado" });
    await expect(c.banco.imobiliario.remover(c.beto.id, apartamentoId)).rejects.toMatchObject({
      codigo: "nao_encontrado",
    });
    const cru = await comoUsuario(c.banco.conexao.db, c.beto.id, (tx) =>
      tx.select().from(lancamentosImobiliarios),
    );
    expect(cru).toEqual([]);
    await expect(
      comoUsuario(c.banco.conexao.db, c.beto.id, (tx) =>
        tx.execute(
          sql`insert into lancamentos_imobiliarios (usuario_id, investimento_id, data, tipo, categoria, valor)
              values (${c.beto.id}, ${apartamentoId}, '2026-01-01', 'receita', 'x', 1)`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("o banco recusa valor zero ou negativo mesmo por fora do repositório", async () => {
    await expect(
      comoUsuario(c.banco.conexao.db, c.ana.id, (tx) =>
        tx.execute(
          sql`insert into lancamentos_imobiliarios (usuario_id, investimento_id, data, tipo, categoria, valor)
              values (${c.ana.id}, ${apartamentoId}, '2026-01-01', 'receita', 'x', -1)`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("remover apaga em cascata e fica na auditoria", async () => {
    await c.banco.imobiliario.remover(c.ana.id, apartamentoId);
    expect(await c.banco.imobiliario.obter(c.ana.id, apartamentoId)).toBeNull();
    const sobra = await c.banco.conexao
      .sql`select count(*)::int as n from lancamentos_imobiliarios where investimento_id = ${apartamentoId}`;
    expect(sobra[0]?.n).toBe(0);
    const trilha = await c.banco.conexao
      .sql`select acao from auditoria where alvo = ${apartamentoId} order by sequencia`;
    expect(trilha.map((t) => t.acao)).toEqual([
      "imobiliario_criado",
      "imobiliario_alterado",
      "imobiliario_removido",
    ]);
    const restantes = await comoUsuario(c.banco.conexao.db, c.ana.id, (tx) =>
      tx.select().from(investimentosImobiliarios),
    );
    expect(restantes.map((r) => r.tipo)).toEqual(["fii"]);
  });
});
