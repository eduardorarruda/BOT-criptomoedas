import { describe, expect, it } from "vitest";
import { derivarPassos, type DadosPassos } from "./primeirosPassos";

const NOVA: DadosPassos = {
  doisFatores: false,
  ia: false,
  contas: [],
  estrategias: [],
  backtests: [],
  robos: [],
  documentos: [],
  controlador: null,
};

const robo = (rede: "papel" | "testnet" | "real", pausado = false) => ({ rede, pausado });

describe("derivarPassos", () => {
  it("instalação nova: 0 de 7, e o primeiro passo é o 2FA", () => {
    const r = derivarPassos(NOVA);
    expect(r).not.toBeNull();
    expect(r?.feitos).toBe(0);
    expect(r?.total).toBe(7);
    expect(r?.completo).toBe(false);
    expect(r?.proximo?.id).toBe("2fa");
    expect(r?.passos.map((p) => p.id)).toEqual([
      "2fa",
      "ia",
      "chave-testnet",
      "estrategia",
      "backtest",
      "robo-papel",
      "conhecimento",
    ]);
  });

  it("cada dado marca o passo dele, e o próximo é o primeiro que falta", () => {
    const r = derivarPassos({
      ...NOVA,
      doisFatores: true,
      contas: [{ rede: "testnet" }],
      estrategias: [{ id: "e" }],
    });
    expect(r?.feitos).toBe(3);
    expect(r?.proximo?.id).toBe("ia");
  });

  it("conectar a IA: logo depois do 2FA, leva às configurações do assistente", () => {
    const passo = (ia: boolean) => derivarPassos({ ...NOVA, doisFatores: true, ia })?.passos[1];
    expect(passo(false)).toMatchObject({ id: "ia", feito: false, para: "/assistente/configuracoes" });
    expect(passo(true)?.feito).toBe(true);
    expect(derivarPassos({ ...NOVA, doisFatores: true })?.proximo?.id).toBe("ia");
    expect(derivarPassos({ ...NOVA, ia: undefined })).toBeNull();
  });

  it("só chave de testnet conta: chave de dinheiro real não é o passo seguro", () => {
    expect(
      derivarPassos({ ...NOVA, contas: [{ rede: "real" }] })?.passos.find((p) => p.id === "chave-testnet")
        ?.feito,
    ).toBe(false);
  });

  it("backtest só conta concluído (na fila, rodando ou falho não)", () => {
    const comEstado = (estado: "na_fila" | "rodando" | "concluido" | "falhou") =>
      derivarPassos({ ...NOVA, backtests: [{ estado }] })?.passos.find((p) => p.id === "backtest")?.feito;
    expect(comEstado("na_fila")).toBe(false);
    expect(comEstado("rodando")).toBe(false);
    expect(comEstado("falhou")).toBe(false);
    expect(comEstado("concluido")).toBe(true);
  });

  it("robô em papel só conta ligado; testnet ou pausado não", () => {
    const papel = (robos: DadosPassos["robos"]) =>
      derivarPassos({ ...NOVA, robos })?.passos.find((p) => p.id === "robo-papel")?.feito;
    expect(papel([robo("testnet")])).toBe(false);
    expect(papel([robo("papel", true)])).toBe(false);
    expect(papel([robo("papel")])).toBe(true);
  });

  it("tudo feito: completo e sem próximo", () => {
    const r = derivarPassos({
      doisFatores: true,
      ia: true,
      contas: [{ rede: "testnet" }],
      estrategias: [{ id: "e" }],
      backtests: [{ estado: "concluido" }],
      robos: [robo("papel")],
      documentos: [{ id: "d" }],
      controlador: null,
    });
    expect(r?.completo).toBe(true);
    expect(r?.proximo).toBeNull();
  });

  it("controlador LGPD fica à parte (só quem opera) e não conta no total", () => {
    const sem = derivarPassos(NOVA);
    expect(sem?.operador).toMatchObject({ id: "lgpd", feito: false, opcional: true });
    expect(sem?.passos.some((p) => p.id === "lgpd")).toBe(false);
    const com = derivarPassos({ ...NOVA, controlador: { nome: "Ana", email: "ana@exemplo.com" } });
    expect(com?.operador?.feito).toBe(true);
    expect(com?.total).toBe(7);
  });

  it("sem saber o controlador (exemplo ou falha ao ler), o passo de quem opera some", () => {
    expect(derivarPassos({ ...NOVA, controlador: undefined })?.operador).toBeNull();
  });

  it("enquanto algum dado carrega, não há lista (nada pisca como 'falta')", () => {
    expect(derivarPassos({ ...NOVA, robos: undefined })).toBeNull();
    expect(derivarPassos({ ...NOVA, doisFatores: undefined })).toBeNull();
  });

  it("cada passo leva a uma tela", () => {
    const destinos = derivarPassos(NOVA)?.passos.map((p) => p.para);
    expect(destinos).toEqual([
      "/contas",
      "/assistente/configuracoes",
      "/contas",
      "/estrategias",
      "/backtests",
      "/robos",
      "/conhecimento",
    ]);
  });
});
