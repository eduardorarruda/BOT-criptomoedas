import { validarRegra } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { ESTRATEGIAS } from "../demo/dados";
import { localizar, type NoGrupo } from "./arvore";
import {
  deEstrategia,
  estadoVazio,
  fracaoDe,
  montar,
  redutor,
  type Acao,
  type EstadoConstrutor,
} from "./estado";

const aplicar = (e: EstadoConstrutor, ...acoes: Acao[]) => acoes.reduce(redutor, e);
const raiz = (e: EstadoConstrutor) => e.entrada as NoGrupo;

describe("construtor: montar a estratégia", () => {
  it("gera uma árvore válida para o domínio a partir de ações da tela", () => {
    let e = aplicar(estadoVazio(), { tipo: "nome", nome: "Teste" });
    e = aplicar(e, { tipo: "adicionar", destinoId: e.entrada.id, indice: 1, bloco: "ou" });
    const ou = raiz(e).filhos[1]!;
    e = aplicar(
      e,
      { tipo: "adicionar", destinoId: ou.id, indice: 0, bloco: "comparar" },
      { tipo: "adicionar", destinoId: ou.id, indice: 1, bloco: "nao" },
    );
    const nao = (raiz(e).filhos[1] as NoGrupo).filhos[1]!;
    e = aplicar(e, { tipo: "adicionar", destinoId: nao.id, indice: 0, bloco: "comparar" });
    const m = montar(e);
    expect(m.problemas).toEqual([]);
    expect(m.estrategia).not.toBeNull();
    expect(validarRegra(m.estrategia!.entrada)).toEqual([]);
    expect(m.estrategia!.entrada).toMatchObject({
      tipo: "e",
      regras: [{ tipo: "comparar" }, { tipo: "ou", regras: [{ tipo: "comparar" }, { tipo: "nao" }] }],
    });
    expect(m.estrategia).toMatchObject({ stop: 0.025, alvoLiquido: 0.03, taxa: 0.001 });
  });

  it("aponta o que falta em vez de deixar salvar", () => {
    let e = aplicar(estadoVazio(), { tipo: "parametro", campo: "stop", valor: "abc" });
    e = aplicar(e, { tipo: "adicionar", destinoId: e.entrada.id, indice: 0, bloco: "nao" });
    const m = montar(e);
    expect(m.estrategia).toBeNull();
    expect(m.problemas).toEqual(
      expect.arrayContaining(["dê um nome à estratégia", "o stop precisa ser um número, como 2,5"]),
    );
    expect(m.problemas.some((p) => p.startsWith("entrada:") && p.includes("NÃO"))).toBe(true);
  });

  it("usa as validações do domínio para grupo vazio e limites de stop", () => {
    let e = aplicar(
      estadoVazio(),
      { tipo: "nome", nome: "x" },
      { tipo: "parametro", campo: "stop", valor: "80" },
    );
    e = aplicar(e, { tipo: "remover", id: raiz(e).filhos[0]!.id });
    const m = montar(e);
    expect(m.problemas).toEqual(
      expect.arrayContaining([
        'entrada: um grupo "E" precisa de pelo menos uma condição',
        "o stop precisa estar entre 0% e 50%",
      ]),
    );
  });

  it("recusa nome longo e parâmetros vazios", () => {
    const e = aplicar(
      estadoVazio(),
      { tipo: "nome", nome: "x".repeat(81) },
      { tipo: "parametro", campo: "alvo", valor: "" },
      { tipo: "parametro", campo: "taxa", valor: "?" },
    );
    expect(montar(e).problemas).toEqual(
      expect.arrayContaining([
        "o nome tem mais de 80 letras",
        "o alvo precisa ser um número, como 3",
        "a taxa precisa ser um número, como 0,1",
      ]),
    );
  });
});

describe("construtor: editar", () => {
  it("carrega uma estratégia existente e devolve a mesma regra", () => {
    const base = ESTRATEGIAS[0]!;
    const e = deEstrategia(base);
    expect(e.stop).toBe("2,5");
    const m = montar(e);
    expect(m.estrategia?.entrada).toEqual(base.entrada);
    expect(m.estrategia?.saida).toEqual(base.saida);
  });

  it("liga e desliga a regra de saída e edita a árvore certa", () => {
    let e = aplicar(estadoVazio(), { tipo: "nome", nome: "s" }, { tipo: "ligarSaida", ligada: true });
    expect(e.editando).toBe("saida");
    e = aplicar(e, { tipo: "adicionar", destinoId: e.saida!.id, indice: 0, bloco: "comparar" });
    expect((e.saida as NoGrupo).filhos).toHaveLength(2);
    expect(montar(e).estrategia?.saida).toBeDefined();
    e = aplicar(e, { tipo: "ligarSaida", ligada: false });
    expect(e.saida).toBeNull();
    expect(aplicar(e, { tipo: "editar", arvore: "saida" }, { tipo: "remover", id: "x" }).saida).toBeNull();
  });

  it("move, envolve em NÃO, desfaz e alterna grupo", () => {
    let e = aplicar(estadoVazio(), { tipo: "nome", nome: "m" });
    e = aplicar(e, { tipo: "adicionar", destinoId: e.entrada.id, indice: 1, bloco: "comparar" });
    const [a, b] = raiz(e).filhos;
    e = aplicar(e, { tipo: "moverIrmao", id: a!.id, delta: 1 });
    expect(raiz(e).filhos.map((x) => x.id)).toEqual([b!.id, a!.id]);
    e = aplicar(e, { tipo: "mover", id: a!.id, destinoId: e.entrada.id, indice: 0 });
    expect(raiz(e).filhos[0]!.id).toBe(a!.id);
    e = aplicar(e, { tipo: "nao", id: a!.id });
    const nao = raiz(e).filhos[0]!;
    expect(nao.tipo).toBe("nao");
    e = aplicar(e, { tipo: "nao", id: nao.id });
    expect(raiz(e).filhos[0]!.id).toBe(a!.id);
    e = aplicar(e, { tipo: "alternarGrupo", id: e.entrada.id });
    expect(e.entrada.tipo).toBe("ou");
    const trocado = { ...(localizar(e.entrada, b!.id)!.no as never as object), comparador: ">" } as never;
    e = aplicar(e, { tipo: "trocarNo", no: trocado });
    expect(localizar(e.entrada, b!.id)?.no).toMatchObject({ comparador: ">" });
    expect(aplicar(e, { tipo: "carregar", estado: estadoVazio() }).nome).toBe("");
  });

  it("lê percentuais digitados", () => {
    expect(fracaoDe("2,5")).toBe(0.025);
    expect(fracaoDe("")).toBeNull();
  });
});
