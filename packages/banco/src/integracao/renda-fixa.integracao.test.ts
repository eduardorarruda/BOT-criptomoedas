import type { NovoTitulo } from "@zentrade/contratos";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoUsuario } from "../cliente.js";
import { titulosRendaFixa } from "../esquema/index.js";
import type { TituloSincronizado } from "../repositorios/pluggy.js";
import { montarCenario, type Cenario } from "./ajuda.js";

const CDB: NovoTitulo = {
  tipo: "CDB",
  nome: "CDB Banco X",
  emissor: "Banco X",
  indexador: "CDI",
  percentualIndexador: "110",
  taxaAnual: null,
  dataAplicacao: "2026-01-15",
  vencimento: "2028-01-15",
  valorAplicado: "10000.00",
  liquidez: "vencimento",
};

const ITEM = "4b6a1a5e-8e0a-4c55-9f43-3b8f3c1d2e7a";

const sincronizado = (externoId: string, bruto = "1010"): TituloSincronizado => ({
  externoId,
  grupo: null,
  tipo: "CDB",
  nome: `CDB ${externoId}`,
  emissor: "Nu Financeira",
  emissorCnpj: "30680829000143",
  indexador: "CDI",
  percentualIndexador: "100",
  taxaAnual: null,
  dataAplicacao: "2026-03-01",
  vencimento: null,
  valorAplicado: "1000",
  liquidez: "diaria",
  informadoEm: "2026-10-10",
  bruto,
  liquido: "1008",
  ir: "2",
  iof: "0",
});

describe("renda fixa no banco", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  it("cadastra, lê, altera e remove um título manual, com valores exatos", async () => {
    const criado = await c.banco.rendaFixa.criar(c.ana.id, CDB);
    expect(criado).toMatchObject({
      origem: "manual",
      valorAplicado: "10000",
      percentualIndexador: "110",
      vencimento: "2028-01-15",
    });
    const alterado = await c.banco.rendaFixa.atualizar(c.ana.id, criado.id, {
      ...CDB,
      nome: "CDB renomeado",
    });
    expect(alterado?.nome).toBe("CDB renomeado");
    expect((await c.banco.rendaFixa.listar(c.ana.id)).map((t) => t.id)).toEqual([criado.id]);
    expect(await c.banco.rendaFixa.remover(c.ana.id, criado.id)).toBe(true);
    expect(await c.banco.rendaFixa.obter(c.ana.id, criado.id)).toBeNull();
  });

  it("RLS: uma pessoa não vê nem mexe no título da outra", async () => {
    const daAna = await c.banco.rendaFixa.criar(c.ana.id, CDB);
    expect(await c.banco.rendaFixa.obter(c.beto.id, daAna.id)).toBeNull();
    expect(await c.banco.rendaFixa.listar(c.beto.id)).toEqual([]);
    expect(await c.banco.rendaFixa.atualizar(c.beto.id, daAna.id, CDB)).toBeNull();
    expect(await c.banco.rendaFixa.remover(c.beto.id, daAna.id)).toBe(false);
    const cruas = await comoUsuario(c.banco.conexao.db, c.beto.id, (tx) =>
      tx.select().from(titulosRendaFixa),
    );
    expect(cruas).toEqual([]);
  });

  it("Pluggy: registra o item, sincroniza, atualiza e encerra o que sumiu", async () => {
    await c.banco.pluggy.registrar(c.ana.id, {
      id: ITEM,
      instituicao: "Nubank",
      conectorId: 612,
      logoUrl: null,
      situacao: "UPDATED",
      erro: null,
      atualizadoNoBanco: new Date("2026-10-10T12:00:00Z"),
      consentimentoExpira: null,
    });
    const primeira = await c.banco.pluggy.aplicarSincronizacao(
      c.ana.id,
      ITEM,
      [sincronizado("a"), sincronizado("b")],
      true,
    );
    expect(primeira).toEqual({ novos: 2, atualizados: 0, encerrados: 0 });
    const segunda = await c.banco.pluggy.aplicarSincronizacao(
      c.ana.id,
      ITEM,
      [sincronizado("a", "1020")],
      true,
    );
    expect(segunda).toEqual({ novos: 0, atualizados: 1, encerrados: 1 });
    const a = (await c.banco.rendaFixa.listar(c.ana.id)).find((t) => t.nome === "CDB a");
    expect(a?.informado).toEqual({ em: "2026-10-10", bruto: "1020", liquido: "1008", ir: "2", iof: "0" });
    expect((await c.banco.pluggy.listar(c.ana.id))[0]).toMatchObject({
      id: ITEM,
      titulos: 1,
      instituicao: "Nubank",
    });
  });

  it("lista parcial (item ainda atualizando) não encerra nada", async () => {
    const r = await c.banco.pluggy.aplicarSincronizacao(c.ana.id, ITEM, [], false);
    expect(r.encerrados).toBe(0);
  });

  it("título da Pluggy não se edita nem se apaga à mão", async () => {
    const a = (await c.banco.rendaFixa.listar(c.ana.id)).find((t) => t.origem === "pluggy");
    await expect(c.banco.rendaFixa.remover(c.ana.id, a!.id)).rejects.toMatchObject({
      codigo: "estado_invalido",
    });
  });

  it("o item de uma pessoa não passa para outra", async () => {
    await expect(
      c.banco.pluggy.registrar(c.beto.id, {
        id: ITEM,
        instituicao: "Nubank",
        conectorId: null,
        logoUrl: null,
        situacao: "UPDATED",
        erro: null,
        atualizadoNoBanco: null,
        consentimentoExpira: null,
      }),
    ).rejects.toMatchObject({ codigo: "conflito" });
    expect(await c.banco.pluggy.listar(c.beto.id)).toEqual([]);
    expect(await c.banco.pluggy.todos()).toEqual([{ id: ITEM, usuarioId: c.ana.id }]);
  });

  it("marca a sincronização e remove a conexão com os títulos dela", async () => {
    await c.banco.pluggy.marcarSincronizacao(c.ana.id, ITEM, new Date("2026-10-11T10:00:00Z"), "falhou");
    expect((await c.banco.pluggy.obter(c.ana.id, ITEM))?.erroSincronizacao).toBe("falhou");
    expect(await c.banco.pluggy.remover(c.ana.id, ITEM)).toBe(true);
    expect((await c.banco.rendaFixa.listar(c.ana.id, true)).filter((t) => t.origem === "pluggy")).toEqual([]);
  });

  it("indicadores: grava em lote, sobrescreve e registra a verificação", async () => {
    await c.banco.indicadores.gravar("CDI", [
      { dia: "2026-10-08", valor: "0.050788" },
      { dia: "2026-10-09", valor: "0.05" },
    ]);
    await c.banco.indicadores.gravar("CDI", [{ dia: "2026-10-09", valor: "0.050788" }]);
    await c.banco.indicadores.registrarVerificacao("CDI", new Date("2026-10-10T09:00:00Z"), null);
    expect(await c.banco.indicadores.ler("CDI", "2026-10-09")).toEqual([
      { dia: "2026-10-09", valor: "0.050788", diaFim: null },
    ]);
    expect(await c.banco.indicadores.estado()).toEqual([
      { serie: "CDI", verificadoEm: Date.parse("2026-10-10T09:00:00Z"), ultimoDia: "2026-10-09", erro: null },
    ]);
  });

  it("o papel da aplicação lê os indicadores, mas não grava", async () => {
    const ler = comoUsuario(c.banco.conexao.db, c.ana.id, (tx) =>
      tx.execute(sql`select count(*) from indicadores`),
    );
    await expect(ler).resolves.toBeDefined();
    const gravar = comoUsuario(c.banco.conexao.db, c.ana.id, (tx) =>
      tx.execute(sql`insert into indicadores (serie, dia, valor) values ('CDI', '2020-01-02', 1)`),
    );
    await expect(gravar).rejects.toThrow();
  });
});
