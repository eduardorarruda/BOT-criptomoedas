import { MODELOS, MODELOS_WIN, validarEstrategia, validarRegra } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { ESTRATEGIAS } from "../demo/dados";
import { paraDominio } from "../lib/estrategia";
import { localizar, type NoGrupo } from "./arvore";
import {
  arvoresVisiveis,
  criarBloco,
  deEstrategia,
  deModelo,
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

describe("construtor: saídas", () => {
  const nomeado = () => aplicar(estadoVazio(), { tipo: "nome", nome: "Saídas" });

  it("sem mexer nas saídas, a estratégia sai como antes (sem campos novos)", () => {
    const m = montar(nomeado());
    expect(Object.keys(m.estrategia!).sort()).toEqual(["alvoLiquido", "entrada", "nome", "stop", "taxa"]);
  });

  it("liga stop por ATR, stop móvel, empate, tempo e tamanho", () => {
    const e = aplicar(nomeado(), {
      tipo: "saidas",
      mudanca: {
        tipoStop: "atr",
        stopAtrMultiplo: "2,5",
        movel: "atr",
        movelMultiplo: "3",
        empate: true,
        empateGatilho: "2",
        tempo: true,
        tempoCandles: "48",
        tamanho: true,
      },
    });
    const m = montar(e);
    expect(m.problemas).toEqual([]);
    expect(m.estrategia).toMatchObject({
      stopAtr: { periodo: 14, multiplo: 2.5 },
      stopMovel: { tipo: "atr", periodo: 14, multiplo: 3 },
      empate: { gatilho: 0.02 },
      tempoMaximo: 48,
      tamanhoPorVolatilidade: { periodo: 14, multiplo: 2 },
    });
    const percentual = montar(
      aplicar(e, { tipo: "saidas", mudanca: { movel: "percentual", movelDistancia: "1,5" } }),
    );
    expect(percentual.estrategia?.stopMovel).toEqual({ tipo: "percentual", distancia: 0.015 });
  });

  it("tamanho por alocação: a fração em % vira a fração da exposição máxima, e não convive com o da volatilidade", () => {
    const e = aplicar(nomeado(), { tipo: "saidas", mudanca: { alocacao: true, alocacaoFracao: "50" } });
    const m = montar(e);
    expect(m.problemas).toEqual([]);
    expect(m.estrategia).toMatchObject({ tamanhoPorAlocacao: { fracao: 0.5 } });
    expect(m.estrategia).not.toHaveProperty("tamanhoPorVolatilidade");
    const dois = montar(aplicar(e, { tipo: "saidas", mudanca: { tamanho: true } }));
    expect(dois.estrategia).toBeNull();
    expect(dois.problemas).toEqual([expect.stringMatching(/um só jeito de definir o tamanho/)]);
    const fora = montar(aplicar(e, { tipo: "saidas", mudanca: { alocacaoFracao: "150" } }));
    expect(fora.problemas).toEqual([expect.stringMatching(/fração da alocação/)]);
    const ilegivel = montar(aplicar(e, { tipo: "saidas", mudanca: { alocacaoFracao: "abc" } }));
    expect(ilegivel.problemas).toEqual([expect.stringMatching(/alocação precisa ser um número/)]);
  });

  it("aponta o que não dá para ler e o que o domínio recusa", () => {
    const ilegivel = aplicar(nomeado(), {
      tipo: "saidas",
      mudanca: {
        tipoStop: "atr",
        stopAtrPeriodo: "1,5",
        stopAtrMultiplo: "x",
        movel: "percentual",
        movelDistancia: "",
        empate: true,
        empateGatilho: "?",
        tempo: true,
        tempoCandles: "dez",
      },
    });
    expect(montar(ilegivel).problemas).toEqual(
      expect.arrayContaining([
        "o período do ATR do stop precisa ser um número inteiro, como 14",
        "o múltiplo do ATR do stop precisa ser um número, como 2",
        "a distância do stop móvel precisa ser um número, como 3",
        "o gatilho do empate precisa ser um número, como 2",
        "o tempo máximo precisa ser um número inteiro de candles, como 24",
      ]),
    );
    const foraDaFaixa = aplicar(nomeado(), { tipo: "saidas", mudanca: { tempo: true, tempoCandles: "0" } });
    expect(montar(foraDaFaixa).problemas).toEqual([expect.stringMatching(/tempo máximo/)]);
  });

  it("carrega uma estratégia com saídas e devolve os mesmos campos", () => {
    const base = ESTRATEGIAS.find((x) => x.stopAtr)!;
    const m = montar(deEstrategia(base));
    expect(m.problemas).toEqual([]);
    const { id: _id, versao: _versao, ...campos } = base;
    expect(m.estrategia).toEqual(campos);
  });

  it.each(MODELOS.map((m) => [m.nome, m] as const))(
    "modelo %s: vira estratégia nova, igual ao modelo",
    (_, modelo) => {
      const e = deModelo(modelo);
      expect(e.id).toBeNull();
      const m = montar(e);
      expect(m.problemas).toEqual([]);
      expect(m.estrategia).toEqual({ nome: modelo.nome, ...modelo.estrategia });
      expect(validarEstrategia(modelo.estrategia)).toEqual([]);
    },
  );

  it("condição pronta da paleta vira uma condição comum e editável", () => {
    expect(criarBloco("pronta:rompimento")).toMatchObject({
      tipo: "comparar",
      esquerda: { tipo: "preco" },
      direita: { nome: "donchian", saida: "superior" },
    });
    expect(criarBloco("pronta:inexistente")).toMatchObject({ tipo: "comparar" });
  });
});

describe("construtor: direção e lado vendido", () => {
  const nomeado = () => aplicar(estadoVazio(), { tipo: "nome", nome: "Vende" });

  it.each(MODELOS_WIN.filter((m) => m.estrategia.direcao !== "ambos").map((m) => [m.nome, m] as const))(
    "modelo do WIN só comprado %s: volta igual ao modelo, sem regras vendidas",
    (_, modelo) => {
      const e = deModelo(modelo);
      expect(e.entradaVendida).toBeNull();
      const m = montar(e);
      expect(m.problemas).toEqual([]);
      expect(m.estrategia).toEqual({ nome: modelo.nome, ...modelo.estrategia });
    },
  );

  it.each(MODELOS_WIN.filter((m) => m.estrategia.direcao === "ambos").map((m) => [m.nome, m] as const))(
    "modelo do WIN %s: guarda a direção e as regras vendidas e volta igual ao modelo",
    (_, modelo) => {
      const e = deModelo(modelo);
      expect(e.direcao).toBe("ambos");
      expect(e.entradaVendida).not.toBeNull();
      expect(e.saidaVendida).not.toBeNull();
      expect(arvoresVisiveis(e)).toEqual(["entrada", "saida", "entradaVendida", "saidaVendida"]);
      const m = montar(e);
      expect(m.problemas).toEqual([]);
      expect(m.estrategia).toEqual({ nome: modelo.nome, ...modelo.estrategia });
    },
  );

  it("estratégia comprada sai sem as chaves novas", () => {
    const m = montar(nomeado());
    expect(m.estrategia).not.toHaveProperty("direcao");
    expect(m.estrategia).not.toHaveProperty("entradaVendida");
    expect(m.estrategia).not.toHaveProperty("saidaVendida");
    expect(arvoresVisiveis(nomeado())).toEqual(["entrada"]);
  });

  it("escolher vendido cria uma regra de entrada vendida e passa a editá-la", () => {
    const e = aplicar(nomeado(), { tipo: "direcao", direcao: "vendido" });
    expect(e.entradaVendida).not.toBeNull();
    expect(e.editando).toBe("entradaVendida");
    expect(arvoresVisiveis(e)).toEqual(["entradaVendida"]);
    const m = montar(e);
    expect(m.problemas).toEqual([]);
    expect(m.estrategia).toMatchObject({ direcao: "vendido", entradaVendida: { tipo: "e" } });
    expect(m.estrategia).not.toHaveProperty("saidaVendida");
    expect(validarEstrategia(paraDominio(m.estrategia!))).toEqual([]);
  });

  it("edita a árvore vendida certa e liga a saída vendida", () => {
    let e = aplicar(nomeado(), { tipo: "direcao", direcao: "ambos" });
    expect(arvoresVisiveis(e)).toEqual(["entrada", "entradaVendida"]);
    e = aplicar(e, { tipo: "adicionar", destinoId: e.entradaVendida!.id, indice: 1, bloco: "comparar" });
    expect((e.entradaVendida as NoGrupo).filhos).toHaveLength(2);
    expect(raiz(e).filhos).toHaveLength(1);
    e = aplicar(e, { tipo: "ligarSaidaVendida", ligada: true });
    expect(e.editando).toBe("saidaVendida");
    expect(arvoresVisiveis(e)).toEqual(["entrada", "entradaVendida", "saidaVendida"]);
    expect(montar(e).estrategia).toMatchObject({ direcao: "ambos", saidaVendida: { tipo: "ou" } });
    e = aplicar(e, { tipo: "ligarSaidaVendida", ligada: false });
    expect(e.saidaVendida).toBeNull();
    expect(e.editando).toBe("entradaVendida");
    expect(montar(e).estrategia).not.toHaveProperty("saidaVendida");
  });

  it("aponta problemas das regras vendidas com o prefixo do lado", () => {
    let e = aplicar(
      nomeado(),
      { tipo: "direcao", direcao: "ambos" },
      { tipo: "ligarSaidaVendida", ligada: true },
    );
    const entradaVendida = e.entradaVendida as NoGrupo;
    e = aplicar(
      e,
      { tipo: "editar", arvore: "entradaVendida" },
      { tipo: "remover", id: entradaVendida.filhos[0]!.id },
      { tipo: "editar", arvore: "saidaVendida" },
      { tipo: "adicionar", destinoId: e.saidaVendida!.id, indice: 0, bloco: "nao" },
    );
    const m = montar(e);
    expect(m.estrategia).toBeNull();
    expect(m.problemas).toEqual(
      expect.arrayContaining([
        'entrada vendida: um grupo "E" precisa de pelo menos uma condição',
        expect.stringMatching(/^saída vendida: um "NÃO" está vazio/),
      ]),
    );
  });

  it("no só vendido, a entrada comprada fica guardada e a saída comprada não vai junto", () => {
    const e = aplicar(
      nomeado(),
      { tipo: "ligarSaida", ligada: true },
      { tipo: "direcao", direcao: "vendido" },
    );
    expect(e.saida).not.toBeNull();
    const m = montar(e);
    expect(m.estrategia?.entrada).toBeDefined();
    expect(m.estrategia).not.toHaveProperty("saida");
  });

  it("no só vendido, entrada comprada quebrada aparece para ser corrigida", () => {
    const base = nomeado();
    const quebrada = aplicar(
      base,
      { tipo: "remover", id: raiz(base).filhos[0]!.id },
      { tipo: "direcao", direcao: "vendido" },
    );
    expect(arvoresVisiveis(quebrada)).toEqual(["entrada", "entradaVendida"]);
    expect(montar(quebrada).problemas).toEqual([
      'entrada comprada (guardada, sem uso no só vendido): um grupo "E" precisa de pelo menos uma condição',
    ]);
  });

  it("voltar para comprado tira as regras vendidas do resultado, mas guarda na tela", () => {
    let e = aplicar(
      nomeado(),
      { tipo: "direcao", direcao: "ambos" },
      { tipo: "ligarSaidaVendida", ligada: true },
    );
    e = aplicar(e, { tipo: "direcao", direcao: "comprado" });
    expect(e.editando).toBe("entrada");
    expect(e.entradaVendida).not.toBeNull();
    expect(arvoresVisiveis(e)).toEqual(["entrada"]);
    const m = montar(e);
    expect(m.problemas).toEqual([]);
    expect(Object.keys(m.estrategia!).sort()).toEqual(["alvoLiquido", "entrada", "nome", "stop", "taxa"]);
    const deNovo = aplicar(e, { tipo: "direcao", direcao: "ambos" });
    expect(deNovo.entradaVendida).toBe(e.entradaVendida);
    expect(deNovo.editando).toBe("entrada");
  });
});

describe("construtor: bloco de horário", () => {
  it("adiciona o bloco, edita a janela e monta uma estratégia válida", () => {
    let e = aplicar(estadoVazio(), { tipo: "nome", nome: "Só à tarde" });
    e = aplicar(e, { tipo: "adicionar", destinoId: e.entrada.id, indice: 1, bloco: "horario" });
    const horario = raiz(e).filhos[1]!;
    expect(horario).toMatchObject({ tipo: "horario", de: "12:00", ate: "15:00" });
    e = aplicar(e, { tipo: "trocarNo", no: { ...horario, de: "13:30", ate: "17:00" } as typeof horario });
    const { estrategia, problemas } = montar(e);
    expect(problemas).toEqual([]);
    expect(estrategia?.entrada).toMatchObject({
      tipo: "e",
      regras: [{ tipo: "comparar" }, { tipo: "horario", de: "13:30", ate: "17:00" }],
    });
    expect(validarRegra(estrategia!.entrada)).toEqual([]);
  });

  it("janela vazia ou horário incompleto impede de salvar e explica", () => {
    let e = aplicar(estadoVazio(), { tipo: "nome", nome: "x" });
    e = aplicar(e, { tipo: "adicionar", destinoId: e.entrada.id, indice: 1, bloco: "horario" });
    const horario = raiz(e).filhos[1]!;
    const igual = montar(
      aplicar(e, { tipo: "trocarNo", no: { ...horario, de: "12:00", ate: "12:00" } as typeof horario }),
    );
    expect(igual.estrategia).toBeNull();
    expect(igual.problemas.join(" ")).toMatch(/diferentes/);
    const vazio = montar(aplicar(e, { tipo: "trocarNo", no: { ...horario, de: "" } as typeof horario }));
    expect(vazio.estrategia).toBeNull();
    expect(vazio.problemas.join(" ")).toMatch(/HH:MM/);
  });
});
