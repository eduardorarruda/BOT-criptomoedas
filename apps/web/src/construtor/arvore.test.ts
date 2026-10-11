import { validarRegra, type Regra } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import {
  alternarGrupo,
  contarNos,
  deRegra,
  desfazerNao,
  destinosPara,
  envolverEmNao,
  inserir,
  localizar,
  mover,
  moverEntreIrmaos,
  novoComparar,
  novoGrupo,
  novoNao,
  paraRegra,
  podeReceber,
  remover,
  type NoEditor,
  type NoGrupo,
} from "./arvore";

const REGRA: Regra = {
  tipo: "e",
  regras: [
    {
      tipo: "comparar",
      esquerda: { tipo: "indicador", nome: "rsi", periodo: 14 },
      comparador: "<",
      direita: { tipo: "numero", valor: 30 },
    },
    {
      tipo: "nao",
      regra: {
        tipo: "comparar",
        esquerda: { tipo: "preco" },
        comparador: "<",
        direita: { tipo: "indicador", nome: "sma", periodo: 200 },
      },
    },
  ],
};

const grupo = (no: NoEditor): NoGrupo => {
  if (no.tipo !== "e" && no.tipo !== "ou") throw new Error("esperava grupo");
  return no;
};

describe("conversão entre a regra do domínio e a árvore do editor", () => {
  it("ida e volta preserva a regra", () => {
    const r = paraRegra(deRegra(REGRA));
    expect(r.regra).toEqual(REGRA);
    expect(r.problemas).toEqual([]);
  });

  it("aponta o NÃO vazio em vez de gerar regra inválida", () => {
    const raiz = novoGrupo("e", [novoComparar(), novoNao()]);
    const r = paraRegra(raiz);
    expect(r.regra).toBeNull();
    expect(r.problemas[0]).toMatch(/NÃO.*vazio/);
  });

  it("grupo vazio vira regra que o domínio recusa com explicação", () => {
    const r = paraRegra(novoGrupo("ou"));
    expect(r.regra).toEqual({ tipo: "ou", regras: [] });
    expect(validarRegra(r.regra!)).toContain('um grupo "OU" precisa de pelo menos uma condição');
  });
});

describe("montar a árvore", () => {
  it("insere condições e grupos e gera uma regra válida", () => {
    let raiz: NoEditor = novoGrupo("e");
    const c1 = novoComparar();
    const ou = novoGrupo("ou");
    raiz = inserir(raiz, raiz.id, 0, c1);
    raiz = inserir(raiz, raiz.id, 1, ou);
    raiz = inserir(raiz, ou.id, 0, novoComparar());
    raiz = inserir(raiz, ou.id, 5, novoComparar());
    const { regra } = paraRegra(raiz);
    expect(regra).not.toBeNull();
    expect(validarRegra(regra!)).toEqual([]);
    expect(contarNos(raiz)).toBe(5);
  });

  it("não põe duas condições dentro do mesmo NÃO", () => {
    const nao = novoNao(novoComparar());
    const raiz = novoGrupo("e", [nao]);
    expect(inserir(raiz, nao.id, 0, novoComparar())).toEqual(raiz);
    expect(podeReceber(raiz, nao.id)).toBe(false);
  });

  it("não insere dentro de uma condição", () => {
    const c = novoComparar();
    const raiz = novoGrupo("e", [c]);
    expect(inserir(raiz, c.id, 0, novoComparar())).toEqual(raiz);
    expect(podeReceber(raiz, c.id)).toBe(false);
    expect(podeReceber(raiz, "nao-existe")).toBe(false);
  });

  it("remove um nó, mas nunca a raiz", () => {
    const c = novoComparar();
    const nao = novoNao(novoComparar());
    const raiz = novoGrupo("e", [c, nao]);
    expect(grupo(remover(raiz, c.id)).filhos).toHaveLength(1);
    expect(remover(raiz, raiz.id)).toBe(raiz);
    const semFilho = remover(raiz, nao.filho!.id);
    expect((grupo(semFilho).filhos[1] as typeof nao).filho).toBeNull();
  });

  it("não altera a árvore original (imutável)", () => {
    const raiz = novoGrupo("e", [novoComparar()]);
    const copia = structuredClone(raiz);
    inserir(raiz, raiz.id, 0, novoComparar());
    remover(raiz, raiz.filhos[0]!.id);
    expect(raiz).toEqual(copia);
  });
});

describe("mover (arrastar e soltar ou teclado)", () => {
  it("move entre grupos", () => {
    const c = novoComparar();
    const ou = novoGrupo("ou", [novoComparar()]);
    const raiz = novoGrupo("e", [c, ou]);
    const nova = mover(raiz, c.id, ou.id, 1);
    expect(grupo(nova).filhos).toHaveLength(1);
    expect(grupo(grupo(nova).filhos[0]!).filhos[1]!.id).toBe(c.id);
  });

  it("reordena no mesmo grupo considerando a saída do próprio nó", () => {
    const [a, b, c] = [novoComparar(), novoComparar(), novoComparar()];
    const raiz = novoGrupo("e", [a, b, c]);
    expect(grupo(mover(raiz, a.id, raiz.id, 3)).filhos.map((x) => x.id)).toEqual([b.id, c.id, a.id]);
    expect(grupo(mover(raiz, c.id, raiz.id, 0)).filhos.map((x) => x.id)).toEqual([c.id, a.id, b.id]);
  });

  it("recusa mover um grupo para dentro dele mesmo, ou mover a raiz", () => {
    const interno = novoGrupo("ou", [novoComparar()]);
    const externo = novoGrupo("e", [interno]);
    const raiz = novoGrupo("e", [externo]);
    expect(mover(raiz, externo.id, interno.id, 0)).toBe(raiz);
    expect(mover(raiz, raiz.id, interno.id, 0)).toBe(raiz);
    expect(mover(raiz, "x", raiz.id, 0)).toBe(raiz);
  });

  it("sobe e desce entre irmãos e para nas pontas", () => {
    const [a, b] = [novoComparar(), novoComparar()];
    const raiz = novoGrupo("e", [a, b]);
    expect(grupo(moverEntreIrmaos(raiz, a.id, 1)).filhos.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(grupo(moverEntreIrmaos(raiz, b.id, -1)).filhos.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(moverEntreIrmaos(raiz, a.id, -1)).toBe(raiz);
    expect(moverEntreIrmaos(raiz, b.id, 1)).toBe(raiz);
    expect(moverEntreIrmaos(raiz, raiz.id, 1)).toBe(raiz);
  });

  it("lista destinos válidos para mover pelo teclado", () => {
    const c = novoComparar();
    const naoVazio = novoNao();
    const ou = novoGrupo("ou", [novoComparar()]);
    const raiz = novoGrupo("e", [c, ou, naoVazio]);
    const destinos = destinosPara(raiz, c.id);
    expect(destinos.map((d) => d.rotulo)).toEqual(["Grupo E › Grupo OU", "Grupo E › NÃO"]);
    expect(destinosPara(raiz, ou.id).map((d) => d.id)).toEqual([naoVazio.id]);
  });
});

describe("NÃO e troca de grupo", () => {
  it("envolve em NÃO e desfaz", () => {
    const c = novoComparar();
    const raiz = novoGrupo("e", [c]);
    const comNao = envolverEmNao(raiz, c.id);
    const nao = grupo(comNao).filhos[0]!;
    expect(nao.tipo).toBe("nao");
    expect(desfazerNao(comNao, nao.id)).toEqual(raiz);
    expect(desfazerNao(raiz, c.id)).toEqual(raiz);
  });

  it("alterna E e OU", () => {
    const raiz = novoGrupo("e", [novoComparar()]);
    expect(alternarGrupo(raiz, raiz.id).tipo).toBe("ou");
    expect(alternarGrupo(alternarGrupo(raiz, raiz.id), raiz.id).tipo).toBe("e");
    const c = raiz.filhos[0]!;
    expect(alternarGrupo(raiz, c.id)).toEqual(raiz);
  });

  it("localiza com pai, índice e profundidade", () => {
    const c = novoComparar();
    const nao = novoNao(c);
    const raiz = novoGrupo("e", [novoComparar(), nao]);
    expect(localizar(raiz, c.id)).toMatchObject({ pai: nao, indice: 0, profundidade: 2 });
    expect(localizar(raiz, "x")).toBeNull();
  });
});
