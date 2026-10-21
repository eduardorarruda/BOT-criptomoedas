import type { Evento } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import type { RegistroAoVivo } from "../../api/esquemas";
import {
  categoriaDe,
  CATEGORIAS,
  chaveEvento,
  filtrarRegistros,
  juntarRegistros,
  mapaDecisoes,
  roboDoEvento,
} from "./eventos";

const sinal = (em: number, roboId = "r1"): Evento => ({
  tipo: "sinal",
  roboId,
  acao: "AGUARDAR",
  explicacao: "x",
  preco: "1",
  em,
});
const reg = (recebidoEm: number, evento: Evento): RegistroAoVivo => ({ recebidoEm, evento });
const decisao: Evento = {
  tipo: "decisao",
  decisao: {
    id: "d1",
    roboId: "r2",
    em: 1,
    sinal: { acao: "COMPRAR", explicacao: "x" },
    preco: "1",
    risco: { aprovada: true, barreiras: [] },
    estado: "executada",
  },
};
const ordem: Evento = {
  tipo: "ordem",
  ordem: {
    id: "o1",
    decisaoId: "d1",
    idCliente: "zt-1",
    simbolo: "BTCUSDT",
    lado: "COMPRA",
    quantidade: "1",
    estado: "PREENCHIDA",
    criadaEm: 1,
    execucoes: [{ preco: "1", quantidade: "1", taxaCotacao: "0", em: 1 }],
  },
};
const TODOS: Evento[] = [
  sinal(1),
  decisao,
  ordem,
  {
    tipo: "candle",
    roboId: "r1",
    simbolo: "B",
    intervalo: "1h",
    candle: { abertura: 5, abre: "1", maxima: "1", minima: "1", fecha: "1", volume: "1" },
  },
  { tipo: "analise", analiseId: "a", roboId: "r1", concluida: false },
  {
    tipo: "analise",
    analiseId: "a",
    roboId: "r1",
    concluida: false,
    etapa: { ferramenta: "f", descricao: "d", em: 2 },
  },
  { tipo: "analise", analiseId: "a", roboId: "r1", concluida: true, resultado: "comprar" },
  { tipo: "risco", roboId: "r1", barreira: { codigo: "c", mensagem: "m" }, em: 3 },
  {
    tipo: "posicao",
    roboId: "r1",
    simbolo: "B",
    quantidade: "1",
    precoMedio: "1",
    resultadoRealizado: "0",
    taxasPagas: "0",
    em: 4,
  },
  { tipo: "preco", simbolo: "B", preco: "1", em: 1 },
  { tipo: "saude", servico: "motor", ok: true, em: 1 },
];

describe("eventos ao vivo", () => {
  it("cada evento tem uma chave própria; preço, saúde e robô não entram nos filtros", () => {
    const robo: Evento = {
      tipo: "robo",
      robo: {
        id: "r1",
        nome: "n",
        simbolo: "BTCUSDT",
        intervalo: "1h",
        modo: "auto",
        rede: "papel",
        estrategiaId: "e",
        estrategiaVersao: 1,
        limites: {
          perdaDiariaMaxima: "1",
          exposicaoMaxima: "1",
          riscoPorOperacao: "1",
          ordensPorHoraMax: 1,
          pausaAposPerdaMin: 0,
          confiancaMinima: 0.5,
          diasDeEvento: "ignorar" as const,
        },
        pausado: false,
        criadoEm: 1,
      },
    };
    const chaves = [...TODOS, robo].map(chaveEvento);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(categoriaDe(robo)).toBeNull();
    expect(categoriaDe(TODOS[9]!)).toBeNull();
    expect(categoriaDe(TODOS[10]!)).toBeNull();
    expect(CATEGORIAS.map((c) => c.valor)).toContain(categoriaDe(ordem));
  });

  it("a ordem é do robô da decisão", () => {
    const deDecisao = mapaDecisoes([reg(1, decisao)]);
    expect(roboDoEvento(ordem, deDecisao)).toBe("r2");
    expect(roboDoEvento(ordem, mapaDecisoes([], [{ id: "d1", roboId: "r9" }]))).toBe("r9");
    expect(roboDoEvento(ordem, () => undefined)).toBeUndefined();
    expect(roboDoEvento(TODOS[9]!, () => "x")).toBeUndefined();
  });

  it("junta sem repetir, em ordem de chegada, até o teto; nada novo devolve a mesma lista", () => {
    const a = [reg(1, sinal(1)), reg(3, sinal(3))];
    const juntos = juntarRegistros(a, [reg(2, sinal(2)), reg(9, sinal(1))]);
    expect(juntos.map((r) => r.recebidoEm)).toEqual([1, 2, 3]);
    expect(juntarRegistros(juntos, [reg(5, sinal(3))])).toBe(juntos);
    expect(juntarRegistros(juntos, [reg(4, sinal(4))], 2).map((r) => r.recebidoEm)).toEqual([3, 4]);
  });

  it("filtra por robô e por categoria", () => {
    const registros = TODOS.map((e, i) => reg(i, e));
    const mapa = mapaDecisoes(registros);
    const todasCategorias = new Set(CATEGORIAS.map((c) => c.valor));
    expect(filtrarRegistros(registros, { categorias: todasCategorias }, mapa)).toHaveLength(9);
    const r2 = filtrarRegistros(registros, { roboId: "r2", categorias: todasCategorias }, mapa);
    expect(r2.map((r) => r.evento.tipo)).toEqual(["decisao", "ordem"]);
    const soSinal = filtrarRegistros(registros, { categorias: new Set(["sinal"]) }, mapa);
    expect(soSinal).toHaveLength(1);
  });
});
