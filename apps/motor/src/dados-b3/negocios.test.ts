import { describe, expect, it } from "vitest";
import {
  CONTRATO_WIN,
  criarLeitorNegocios,
  lerCabecalhoNegocios,
  lerHoraB3,
  lerPrecoMil,
} from "./negocios.js";

const CABECALHO =
  "DataReferencia;CodigoInstrumento;AcaoAtualizacao;PrecoNegocio;QuantidadeNegociada;HoraFechamento;CodigoIdentificadorNegocio;TipoSessaoPregao;DataNegocio;CodigoParticipanteComprador;CodigoParticipanteVendedor;TipoDoCanal";

const linha = (campos: Partial<Record<string, string>> = {}) => {
  const c = {
    instrumento: "WINZ26",
    acao: "0",
    preco: "209500,000",
    quantidade: "4300",
    hora: "090055940",
    id: "10",
    sessao: "1",
    data: "2026-10-16",
    ...campos,
  };
  return `2026-10-16;${c.instrumento};${c.acao};${c.preco};${c.quantidade};${c.hora};${c.id};${c.sessao};${c.data};88;88;1`;
};

describe("cabeçalho do arquivo de negócios da B3", () => {
  it("acha as colunas pelo nome, em qualquer ordem", () => {
    expect(lerCabecalhoNegocios(CABECALHO)).toEqual({
      instrumento: 1,
      acao: 2,
      preco: 3,
      quantidade: 4,
      hora: 5,
      id: 6,
      sessao: 7,
      data: 8,
    });
    const trocado =
      "CodigoInstrumento;DataNegocio;PrecoNegocio;QuantidadeNegociada;HoraFechamento;CodigoIdentificadorNegocio;TipoSessaoPregao;AcaoAtualizacao";
    expect(lerCabecalhoNegocios(`\uFEFF${trocado}\r`).data).toBe(1);
  });

  it("recusa outro arquivo dizendo qual coluna falta", () => {
    expect(() => lerCabecalhoNegocios("<DATE>\t<TIME>\t<OPEN>")).toThrow(/CodigoInstrumento/);
    expect(() => lerCabecalhoNegocios(CABECALHO.replace("TipoSessaoPregao", "Sessao"))).toThrow(
      /TipoSessaoPregao/,
    );
  });
});

describe("campos de um negócio", () => {
  it("preço com vírgula decimal vira milésimos de ponto, sem ponto flutuante", () => {
    expect(lerPrecoMil("209500,000")).toBe(209_500_000);
    expect(lerPrecoMil("209500,5")).toBe(209_500_500);
    expect(lerPrecoMil("209500")).toBe(209_500_000);
    expect(lerPrecoMil("0,015")).toBe(15);
    expect(lerPrecoMil("209.500,000")).toBeNull();
    expect(lerPrecoMil("1,0001")).toBeNull();
    expect(lerPrecoMil("-1,000")).toBeNull();
    expect(lerPrecoMil("")).toBeNull();
  });

  it("HoraFechamento HHMMSSmmm é horário de Brasília (UTC−3)", () => {
    expect(lerHoraB3("2026-10-16", "090055940")).toBe(Date.UTC(2026, 9, 16, 12, 0, 55, 940));
    expect(lerHoraB3("2026-10-16", "183125048")).toBe(Date.UTC(2026, 9, 16, 21, 31, 25, 48));
    // Antes de 2019 havia horário de verão: em 15/01/2018, Brasília estava em UTC−2.
    expect(lerHoraB3("2018-01-15", "100000000")).toBe(Date.UTC(2018, 0, 15, 12));
    expect(lerHoraB3("2026-10-16", "250000000")).toBeNull();
    expect(lerHoraB3("2026-10-16", "096000000")).toBeNull();
    expect(lerHoraB3("2026-10-16", "09005594")).toBeNull();
    expect(lerHoraB3("2026-02-30", "090000000")).toBeNull();
    expect(lerHoraB3("16/10/2026", "090000000")).toBeNull();
  });

  it("só casa contrato futuro de WIN (nada de opção, DI ou dólar)", () => {
    expect(["WINZ26", "WINV26", "WING27", "WINJ27"].every((s) => CONTRATO_WIN.test(s))).toBe(true);
    expect(
      ["WINX26C200000", "WIN", "WDOZ26", "DI1F27", "WINA26", "WINZ2", "IND Z26"].some((s) =>
        CONTRATO_WIN.test(s),
      ),
    ).toBe(false);
  });
});

describe("leitor de linhas", () => {
  const ler = criarLeitorNegocios(CABECALHO);

  it("lê um negócio novo do WIN: preço, quantidade em contratos, instante e sessão", () => {
    expect(ler(linha())).toEqual({
      negocio: {
        instrumento: "WINZ26",
        acao: "novo",
        id: "10",
        precoMil: 209_500_000,
        quantidade: 4300,
        instante: Date.UTC(2026, 9, 16, 12, 0, 55, 940),
        sessao: 1,
        data: "2026-10-16",
      },
    });
  });

  it("ação 2 é cancelamento do negócio de mesmo número", () => {
    const lido = ler(linha({ acao: "2", hora: "101500000" }));
    expect(lido && "negocio" in lido && lido.negocio.acao).toBe("cancelamento");
  });

  it("pula o que não é WIN sem ler o resto da linha", () => {
    expect(ler(linha({ instrumento: "DI1F27", preco: "lixo" }))).toBeNull();
    expect(ler(linha({ instrumento: "WINX26C200000" }))).toBeNull();
  });

  it("aceita outro filtro de instrumento", () => {
    const dolar = criarLeitorNegocios(CABECALHO, /^WDO[FGHJKMNQUVXZ]\d\d$/);
    expect(dolar(linha({ instrumento: "WDOZ26" }))).toHaveProperty("negocio");
    expect(dolar(linha())).toBeNull();
  });

  it("linha estranha do WIN volta com o motivo, sem derrubar a leitura", () => {
    expect(ler(linha({ preco: "abc" }))).toEqual({ motivo: 'preço inválido: "abc"' });
    expect(ler(linha({ preco: "0,000" }))).toEqual({ motivo: 'preço inválido: "0,000"' });
    expect(ler(linha({ quantidade: "0" }))).toEqual({ motivo: 'quantidade inválida: "0"' });
    expect(ler(linha({ quantidade: "1,5" }))).toEqual({ motivo: 'quantidade inválida: "1,5"' });
    expect(ler(linha({ hora: "9:00" }))).toEqual({ motivo: 'data ou hora inválida: "2026-10-16 9:00"' });
    expect(ler(linha({ acao: "1" }))).toEqual({ motivo: 'ação de atualização desconhecida: "1"' });
    expect(ler(linha({ sessao: "x" }))).toEqual({ motivo: 'sessão inválida: "x"' });
    expect(ler(linha({ id: "" }))).toEqual({ motivo: "número do negócio vazio" });
    expect(ler("2026-10-16;WINZ26;0")).toEqual({ motivo: "3 colunas, o cabeçalho tem pelo menos 9" });
  });

  it("ignora o \\r do fim de linha do Windows", () => {
    const lido = ler(`${linha()}\r`);
    expect(lido && "negocio" in lido).toBe(true);
  });
});
