import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoUsuario } from "../cliente.js";
import { robos } from "../esquema/index.js";
import { ESTRATEGIA, montarCenario, type Cenario } from "./ajuda.js";

describe("Row Level Security isola as pessoas", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  it("cada pessoa só enxerga os próprios robôs e estratégias", async () => {
    expect((await c.banco.robos.listar(c.ana.id)).map((r) => r.id)).toEqual([c.ana.robo.id]);
    expect(await c.banco.robos.obter(c.ana.id, c.beto.robo.id)).toBeNull();
    expect(await c.banco.estrategias.obter(c.ana.id, c.beto.estrategia.id)).toBeNull();
    expect(await c.banco.robos.posicao(c.ana.id, c.beto.robo.id)).toBeNull();
  });

  it("vale mesmo sem WHERE: a policy filtra a consulta crua", async () => {
    const linhas = await comoUsuario(c.banco.conexao.db, c.ana.id, (tx) => tx.select().from(robos));
    expect(linhas.map((r) => r.usuarioId)).toEqual([c.ana.id]);
  });

  it("não deixa gravar em nome de outra pessoa", async () => {
    await comoUsuario(c.banco.conexao.db, c.ana.id, (tx) =>
      tx.execute(sql`update robos set nome = 'invadido' where id = ${c.beto.robo.id}`),
    );
    expect((await c.banco.robos.obter(c.beto.id, c.beto.robo.id))!.nome).toBe("BTC devagar");
    await expect(
      comoUsuario(c.banco.conexao.db, c.ana.id, (tx) =>
        tx.execute(sql`insert into estrategias (usuario_id, nome) values (${c.beto.id}, 'falsa')`),
      ),
    ).rejects.toThrow();
  });

  it("não deixa apontar o próprio robô para a estratégia de outra pessoa", async () => {
    await expect(c.banco.robos.criar(c.ana.id, roboDe(c.beto.estrategia.id))).rejects.toMatchObject({
      codigo: "invalido",
    });
  });

  it("sem app.usuario_id o papel da aplicação não vê nada", async () => {
    const linhas = await c.banco.conexao.db.transaction(async (tx) => {
      await tx.execute(sql`set local role zentrade_app`);
      return tx.select().from(robos);
    });
    expect(linhas).toHaveLength(0);
  });

  it("versões de estratégia são imutáveis", async () => {
    const nova = await c.banco.estrategias.novaVersao(c.ana.id, c.ana.estrategia.id, {
      ...ESTRATEGIA,
      stop: 0.03,
    });
    expect(nova.versao).toBe(2);
    await expect(
      c.banco.conexao
        .sql`update estrategia_versoes set stop = 0.4 where estrategia_id = ${c.ana.estrategia.id}`,
    ).rejects.toThrow(/só aceita inclusão/);
    const detalhe = await c.banco.estrategias.obter(c.ana.id, c.ana.estrategia.id);
    expect(detalhe!.versoes.map((v) => [v.versao, v.stop])).toEqual([
      [1, 0.02],
      [2, 0.03],
    ]);
  });
});

function roboDe(estrategiaId: string) {
  return {
    nome: "Robô atravessado",
    simbolo: "ETHUSDT",
    intervalo: "1h" as const,
    modo: "observar" as const,
    rede: "papel" as const,
    estrategiaId,
    estrategiaVersao: 1,
    limites: {
      perdaDiariaMaxima: "1",
      exposicaoMaxima: "1",
      riscoPorOperacao: "1",
      ordensPorHoraMax: 1,
      pausaAposPerdaMin: 0,
      confiancaMinima: 0.5,
    },
  };
}
