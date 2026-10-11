import { describe, expect, it, vi } from "vitest";
import { conectarTempoReal, interpretarEvento, proximaEspera, urlTempoReal } from "./tempoReal";

class SocketFalso {
  onopen: (() => void) | null = null;
  onmessage: ((m: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  fechado = false;
  close() {
    this.fechado = true;
  }
  receber(dados: unknown) {
    this.onmessage?.({ data: typeof dados === "string" ? dados : JSON.stringify(dados) } as MessageEvent);
  }
}

const EVENTO_PRECO = { tipo: "preco", simbolo: "BTCUSDT", preco: "64000.5", em: 1 };

describe("interpretarEvento", () => {
  it("aceita eventos do contrato", () => {
    expect(interpretarEvento(JSON.stringify(EVENTO_PRECO))).toEqual(EVENTO_PRECO);
  });

  it("aceita o passo a passo da análise", () => {
    const e = { tipo: "analise", analiseId: "a1", roboId: "r1", concluida: false };
    expect(interpretarEvento(JSON.stringify(e))).toEqual(e);
  });

  it("ignora JSON quebrado e eventos fora do formato", () => {
    expect(interpretarEvento("{")).toBeNull();
    expect(interpretarEvento(JSON.stringify({ tipo: "preco", preco: 1 }))).toBeNull();
  });
});

describe("conectarTempoReal", () => {
  function preparar() {
    const sockets: SocketFalso[] = [];
    const agendados: (() => void)[] = [];
    const eventos: unknown[] = [];
    const estados: string[] = [];
    const fechar = conectarTempoReal({
      url: "ws://teste/api/v1/tempo-real",
      criarSocket: () => {
        const s = new SocketFalso();
        sockets.push(s);
        return s as unknown as WebSocket;
      },
      agendar: (f) => {
        agendados.push(f);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
      aoEvento: (e) => eventos.push(e),
      aoEstado: (s) => estados.push(s),
    });
    return { sockets, agendados, eventos, estados, fechar };
  }

  it("entrega os eventos válidos e descarta os inválidos", () => {
    const t = preparar();
    t.sockets[0]!.onopen?.();
    t.sockets[0]!.receber(EVENTO_PRECO);
    t.sockets[0]!.receber("lixo");
    expect(t.eventos).toEqual([EVENTO_PRECO]);
    expect(t.estados).toEqual(["conectando", "conectado"]);
  });

  it("reconecta quando a conexão cai", () => {
    const t = preparar();
    t.sockets[0]!.onclose?.();
    expect(t.estados.at(-1)).toBe("reconectando");
    t.agendados[0]!();
    expect(t.sockets).toHaveLength(2);
    t.sockets[1]!.onopen?.();
    expect(t.estados.at(-1)).toBe("conectado");
  });

  it("para de reconectar depois de encerrado", () => {
    const t = preparar();
    t.fechar();
    expect(t.sockets[0]!.fechado).toBe(true);
    t.sockets[0]!.onclose?.();
    expect(t.agendados).toHaveLength(0);
    expect(t.estados.at(-1)).toBe("desligado");
  });

  it("cancela a reconexão agendada ao encerrar", () => {
    const limpar = vi.spyOn(globalThis, "clearTimeout");
    const t = preparar();
    t.sockets[0]!.onclose?.();
    t.fechar();
    expect(limpar).toHaveBeenCalled();
  });
});

describe("auxiliares", () => {
  it("espera cresce e tem teto", () => {
    expect(proximaEspera(0)).toBe(1000);
    expect(proximaEspera(3)).toBe(8000);
    expect(proximaEspera(10)).toBe(30_000);
  });

  it("usa wss em https", () => {
    expect(urlTempoReal({ protocol: "https:", host: "zt.exemplo" })).toBe(
      "wss://zt.exemplo/api/v1/tempo-real",
    );
    expect(urlTempoReal({ protocol: "http:", host: "localhost:5173" })).toBe(
      "ws://localhost:5173/api/v1/tempo-real",
    );
  });
});
