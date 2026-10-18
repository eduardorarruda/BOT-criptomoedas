import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarCenario, type Cenario } from "./ajuda.js";

describe("repositório de importações da B3 (upload de .zip)", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  it("cria na fila, lista e obtém só as da própria pessoa (RLS)", async () => {
    const criada = await c.banco.importacoesB3.criar(c.ana.id, "arquivo.zip", "/tmp/arquivo.zip");
    expect(criada).toMatchObject({ nomeArquivo: "arquivo.zip", estado: "na_fila", resumo: null, erro: null });
    expect(await c.banco.importacoesB3.obter(c.ana.id, criada.id)).toMatchObject({ estado: "na_fila" });
    expect(await c.banco.importacoesB3.obter(c.beto.id, criada.id)).toBeNull();
    expect((await c.banco.importacoesB3.listar(c.ana.id)).map((i) => i.id)).toContain(criada.id);
    expect(await c.banco.importacoesB3.listar(c.beto.id)).toEqual([]);
  });

  it("o motor lê o caminho (acesso de sistema, sem RLS), marca lendo e conclui com o resumo", async () => {
    const criada = await c.banco.importacoesB3.criar(c.ana.id, "dia.zip", "/tmp/dia.zip");
    const paraProcessar = await c.banco.importacoesB3.obterParaProcessar(criada.id);
    expect(paraProcessar).toMatchObject({ caminho: "/tmp/dia.zip", nomeArquivo: "dia.zip" });

    await c.banco.importacoesB3.marcarLendo(criada.id);
    expect((await c.banco.importacoesB3.obter(c.ana.id, criada.id))!.estado).toBe("lendo");

    const resumo = { dias: [{ data: "2026-10-01", contrato: "WINZ26", negocios: 100, negociosUsados: 90, gravados: { "5m": 10 } }] };
    await c.banco.importacoesB3.concluir(criada.id, resumo);
    const concluida = await c.banco.importacoesB3.obter(c.ana.id, criada.id);
    expect(concluida).toMatchObject({ estado: "concluida", erro: null, resumo });
    expect(concluida!.concluidoEm).not.toBeNull();
  });

  it("falha grava o erro legível e marca falhou", async () => {
    const criada = await c.banco.importacoesB3.criar(c.ana.id, "ruim.zip", "/tmp/ruim.zip");
    await c.banco.importacoesB3.falhar(criada.id, "o .zip não tem um .txt dentro");
    expect(await c.banco.importacoesB3.obter(c.ana.id, criada.id)).toMatchObject({
      estado: "falhou",
      erro: "o .zip não tem um .txt dentro",
      resumo: null,
    });
  });

  it("sem a importação, obterParaProcessar devolve null", async () => {
    expect(
      await c.banco.importacoesB3.obterParaProcessar("00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });
});
