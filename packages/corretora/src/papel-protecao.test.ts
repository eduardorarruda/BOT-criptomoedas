import type { PedidoProtecao } from "@zentrade/contratos";
import { dec, type Candle } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { PapelCorretora } from "./papel.js";

const MIN = 60_000;

/** Candle de 1 min com abertura, mínima, máxima e fechamento informados. */
const candle = (abertura: number, abre: string, minima: string, maxima: string, fecha = abre): Candle => ({
  abertura,
  fechamento: abertura + MIN - 1,
  abre: dec(abre),
  maxima: dec(maxima),
  minima: dec(minima),
  fecha: dec(fecha),
  volume: dec(1),
});

const plano = (preco: string) => candle(0, preco, preco, preco);

/** Papel com 1 BTC comprado a 100 (sem taxa nem deslizamento na compra para as contas ficarem limpas). */
async function comPosicao(deslizamentoBps = 0) {
  let agora = MIN; // depois do candle inicial
  const papel = new PapelCorretora({
    saldos: { USDT: dec(1000) },
    taxa: 0.001,
    deslizamentoBps,
    agora: () => agora,
  });
  papel.alimentar("BTCUSDT", "1m", plano("100"));
  await papel.enviarOrdemMercado({ simbolo: "BTCUSDT", lado: "COMPRA", quantidade: dec(1), idCliente: "c" });
  return {
    papel,
    avancar: (ms: number) => {
      agora += ms;
    },
  };
}

const oco = (extra: Partial<PedidoProtecao> = {}): PedidoProtecao => ({
  simbolo: "BTCUSDT",
  quantidade: dec(1),
  stop: dec(98),
  limite: dec(97),
  alvo: dec(103),
  ids: { lista: "zt-l", stop: "zt-s", alvo: "zt-a" },
  ...extra,
});

describe("PapelCorretora: proteção que fica no livro (stop-limit e OCO)", () => {
  it("colocar trava a base: o saldo livre cai e a proteção fica ATIVA", async () => {
    const { papel } = await comPosicao();
    const r = await papel.colocarProtecao(oco());
    expect(r.estado).toBe("ATIVA");
    expect(r.idCorretora).toMatch(/^papel-/);
    expect(r.pernas.map((p) => [p.perna, p.ordem.idCliente, p.ordem.estado])).toEqual([
      ["stop", "zt-s", "PENDENTE"],
      ["alvo", "zt-a", "PENDENTE"],
    ]);
    expect((await papel.saldoLivre("BTC")).isZero()).toBe(true);
    expect(papel.saldoBloqueado("BTC").equals(dec(1))).toBe(true);
  });

  it("colocar de novo com os mesmos ids devolve a mesma proteção (idempotente)", async () => {
    const { papel } = await comPosicao();
    const a = await papel.colocarProtecao(oco());
    const b = await papel.colocarProtecao(oco());
    expect(b).toEqual(a);
    expect(papel.saldoBloqueado("BTC").equals(dec(1))).toBe(true);
  });

  it("a mínima do candle no stop dispara a venda no stop, com taxa, e cancela o alvo", async () => {
    const { papel, avancar } = await comPosicao();
    await papel.colocarProtecao(oco());
    avancar(MIN);
    papel.alimentar("BTCUSDT", "1m", candle(MIN, "99", "97.5", "99.5", "99"));
    const r = await papel.consultarProtecao("BTCUSDT", oco().ids);
    expect(r?.estado).toBe("EXECUTADA");
    const [stop, alvo] = r!.pernas;
    expect(stop?.ordem.estado).toBe("PREENCHIDA");
    expect(stop?.ordem.execucoes[0]?.preco.equals(dec(98))).toBe(true);
    expect(stop?.ordem.execucoes[0]?.lado).toBe("VENDA");
    expect(stop?.ordem.execucoes[0]?.taxaCotacao.equals(dec("0.098"))).toBe(true);
    expect(alvo?.ordem.estado).toBe("CANCELADA");
    expect(papel.saldoBloqueado("BTC").isZero()).toBe(true);
    expect((await papel.saldoLivre("USDT")).equals(dec("997.802"))).toBe(true); // 899,9 + 98 − 0,098
    expect((await papel.consultarOrdem("BTCUSDT", "zt-s"))?.estado).toBe("PREENCHIDA");
  });

  it("deslizamento no stop nunca passa do limite", async () => {
    const { papel, avancar } = await comPosicao(1_000); // 10%
    await papel.colocarProtecao(oco());
    avancar(MIN);
    papel.alimentar("BTCUSDT", "1m", candle(MIN, "99", "90", "99"));
    const r = await papel.consultarProtecao("BTCUSDT", oco().ids);
    expect(r?.pernas[0]?.ordem.execucoes[0]?.preco.equals(dec(97))).toBe(true);
  });

  it("a máxima do candle no alvo vende no alvo (ordem no livro, sem deslizamento)", async () => {
    const { papel, avancar } = await comPosicao(10);
    await papel.colocarProtecao(oco());
    avancar(MIN);
    papel.alimentar("BTCUSDT", "1m", candle(MIN, "101", "100.5", "103.2"));
    const r = await papel.consultarProtecao("BTCUSDT", oco().ids);
    expect(r?.estado).toBe("EXECUTADA");
    expect(r?.pernas[1]?.ordem.execucoes[0]?.preco.equals(dec(103))).toBe(true);
    expect(r?.pernas[0]?.ordem.estado).toBe("CANCELADA");
  });

  it("candle que toca o stop e o alvo: vale o pior caso (stop), a não ser que abra no alvo", async () => {
    const ambos = await comPosicao();
    await ambos.papel.colocarProtecao(oco());
    ambos.avancar(MIN);
    ambos.papel.alimentar("BTCUSDT", "1m", candle(MIN, "100", "97.5", "103.5"));
    const r1 = await ambos.papel.consultarProtecao("BTCUSDT", oco().ids);
    expect(r1?.pernas[0]?.ordem.estado).toBe("PREENCHIDA");

    const abreNoAlvo = await comPosicao();
    await abreNoAlvo.papel.colocarProtecao(oco());
    abreNoAlvo.avancar(MIN);
    abreNoAlvo.papel.alimentar("BTCUSDT", "1m", candle(MIN, "104", "97.5", "104"));
    const r2 = await abreNoAlvo.papel.consultarProtecao("BTCUSDT", oco().ids);
    expect(r2?.pernas[1]?.ordem.execucoes[0]?.preco.equals(dec(103))).toBe(true);
  });

  it("abertura abaixo do limite (gap): dispara, não executa, e executa no limite quando o preço volta", async () => {
    const { papel, avancar } = await comPosicao();
    await papel.colocarProtecao(oco());
    avancar(MIN);
    papel.alimentar("BTCUSDT", "1m", candle(MIN, "95", "94", "96"));
    expect((await papel.consultarProtecao("BTCUSDT", oco().ids))?.estado).toBe("ATIVA");
    avancar(MIN);
    papel.alimentar("BTCUSDT", "1m", candle(2 * MIN, "96", "95.5", "97.4"));
    const r = await papel.consultarProtecao("BTCUSDT", oco().ids);
    expect(r?.estado).toBe("EXECUTADA");
    expect(r?.pernas[0]?.ordem.execucoes[0]?.preco.equals(dec(97))).toBe(true);
  });

  it("abertura entre o stop e o limite: executa na abertura", async () => {
    const { papel, avancar } = await comPosicao();
    await papel.colocarProtecao(oco());
    avancar(MIN);
    papel.alimentar("BTCUSDT", "1m", candle(MIN, "97.5", "97.2", "97.8"));
    const r = await papel.consultarProtecao("BTCUSDT", oco().ids);
    expect(r?.pernas[0]?.ordem.execucoes[0]?.preco.equals(dec("97.5"))).toBe(true);
  });

  it("candle que fechou antes de a proteção existir não dispara nada", async () => {
    const { papel } = await comPosicao();
    await papel.colocarProtecao(oco());
    papel.alimentar("BTCUSDT", "15m", { ...candle(-14 * MIN, "99", "90", "99"), fechamento: MIN - 1 });
    expect((await papel.consultarProtecao("BTCUSDT", oco().ids))?.estado).toBe("ATIVA");
  });

  it("stop sozinho (sem alvo): uma perna só", async () => {
    const { papel, avancar } = await comPosicao();
    const ids = { lista: "zt-s", stop: "zt-s" };
    const { alvo: _sem, ...semAlvo } = oco({ ids });
    const r = await papel.colocarProtecao(semAlvo);
    expect(r.pernas.map((p) => p.perna)).toEqual(["stop"]);
    avancar(MIN);
    papel.alimentar("BTCUSDT", "1m", candle(MIN, "110", "108", "120"));
    expect((await papel.consultarProtecao("BTCUSDT", ids))?.estado).toBe("ATIVA");
    papel.alimentar("BTCUSDT", "1m", candle(2 * MIN, "99", "97.9", "99"));
    expect((await papel.consultarProtecao("BTCUSDT", ids))?.estado).toBe("EXECUTADA");
  });

  it("recusa como a Binance: stop que dispararia na hora, alvo abaixo do preço, sem saldo, abaixo do mínimo", async () => {
    const { papel } = await comPosicao();
    const recusa = async (p: PedidoProtecao) => {
      const r = await papel.colocarProtecao(p);
      expect(r.estado).toBe("REJEITADA");
      expect(r.motivo).toBeTruthy();
      return r.motivo;
    };
    expect(await recusa(oco({ stop: dec(100), ids: { lista: "1", stop: "1s", alvo: "1a" } }))).toMatch(
      /dispararia/,
    );
    expect(await recusa(oco({ alvo: dec(99.5), ids: { lista: "2", stop: "2s", alvo: "2a" } }))).toMatch(
      /alvo/,
    );
    expect(await recusa(oco({ limite: dec(99), ids: { lista: "3", stop: "3s", alvo: "3a" } }))).toMatch(
      /limite/,
    );
    expect(await recusa(oco({ quantidade: dec(2), ids: { lista: "4", stop: "4s", alvo: "4a" } }))).toMatch(
      /Saldo insuficiente/,
    );
    expect(
      await recusa(oco({ quantidade: dec("0.01"), ids: { lista: "5", stop: "5s", alvo: "5a" } })),
    ).toMatch(/mínimo/);
    expect(papel.saldoBloqueado("BTC").isZero()).toBe(true);
  });

  it("cancelar devolve a base ao saldo livre; consultar e cancelar o que não existe dá null", async () => {
    const { papel } = await comPosicao();
    await papel.colocarProtecao(oco());
    const r = await papel.cancelarProtecao("BTCUSDT", oco().ids);
    expect(r?.estado).toBe("CANCELADA");
    expect(r?.pernas.every((p) => p.ordem.estado === "CANCELADA")).toBe(true);
    expect((await papel.saldoLivre("BTC")).equals(dec(1))).toBe(true);
    expect((await papel.cancelarProtecao("BTCUSDT", oco().ids))?.estado).toBe("CANCELADA");
    expect((await papel.saldoLivre("BTC")).equals(dec(1))).toBe(true);
    const outros = { lista: "x", stop: "y" };
    expect(await papel.consultarProtecao("BTCUSDT", outros)).toBeNull();
    expect(await papel.cancelarProtecao("BTCUSDT", outros)).toBeNull();
  });

  it("cancelar depois de executar devolve EXECUTADA (a venda já aconteceu)", async () => {
    const { papel, avancar } = await comPosicao();
    await papel.colocarProtecao(oco());
    avancar(MIN);
    papel.alimentar("BTCUSDT", "1m", candle(MIN, "99", "97.5", "99"));
    expect((await papel.cancelarProtecao("BTCUSDT", oco().ids))?.estado).toBe("EXECUTADA");
  });

  it("a ordem a mercado não vende a base travada pela proteção", async () => {
    const { papel } = await comPosicao();
    await papel.colocarProtecao(oco());
    const r = await papel.enviarOrdemMercado({
      simbolo: "BTCUSDT",
      lado: "VENDA",
      quantidade: dec(1),
      idCliente: "v",
    });
    expect(r.estado).toBe("REJEITADA");
    expect(r.motivo).toMatch(/Saldo insuficiente de BTC/);
  });
});
