import { verificar, type PropostaCriada } from "@zentrade/contratos";
import { describe, expect, it, vi } from "vitest";
import { criarClienteN8n, n8nComRegistro } from "./n8n.js";

const SEGREDO = "s".repeat(40);
const proposta: PropostaCriada = {
  decisaoId: "d1",
  roboId: "r1",
  simbolo: "BTCUSDT",
  acao: "COMPRAR",
  quantidade: "0.01",
  preco: "60000",
  resumo: "cruzamento de médias",
  expiraEm: 1_000_000,
};

function buscarFalso(status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response("{}", { status }));
}

describe("envio para o n8n", () => {
  it("assina o corpo exato que envia, no caminho do contrato", async () => {
    const buscar = buscarFalso();
    const n8n = criarClienteN8n({ url: "http://n8n:5678/", segredo: SEGREDO, buscar, agora: () => 5_000 });
    await n8n.enviarProposta(proposta);
    const [url, init] = buscar.mock.calls[0]!;
    expect(url).toBe("http://n8n:5678/webhook/zentrade-proposta");
    const corpo = init!.body as string;
    const cabecalho = (init!.headers as Record<string, string>)["x-zentrade-assinatura"];
    expect(verificar(corpo, cabecalho, SEGREDO, 5_000)).toBe(true);
    expect(JSON.parse(corpo)).toEqual(proposta);
  });

  it("manda alerta assinado", async () => {
    const buscar = buscarFalso();
    const n8n = criarClienteN8n({ url: "http://n8n:5678", segredo: SEGREDO, buscar, agora: () => 1 });
    await n8n.enviarAlerta({ tipo: "parada_total", titulo: "Parada total", mensagem: "ligada", em: 1 });
    expect(buscar.mock.calls[0]![0]).toBe("http://n8n:5678/webhook/zentrade-alerta");
  });

  it("resposta de erro do n8n vira exceção com explicação", async () => {
    const n8n = criarClienteN8n({
      url: "http://n8n:5678",
      segredo: SEGREDO,
      buscar: buscarFalso(500),
      agora: () => 1,
    });
    await expect(n8n.enviarProposta(proposta)).rejects.toThrow(/n8n respondeu 500/);
  });

  it("não envia proposta fora do contrato", async () => {
    const buscar = buscarFalso();
    const n8n = criarClienteN8n({ url: "http://n8n:5678", segredo: SEGREDO, buscar, agora: () => 1 });
    await expect(n8n.enviarProposta({ ...proposta, resumo: "x".repeat(1001) })).rejects.toThrow();
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("status das automações a partir dos envios", () => {
  it("anota sucesso e falha de cada envio, sem engolir o erro", async () => {
    const registro = { registrar: vi.fn(async () => undefined) };
    const cliente = {
      enviarProposta: vi.fn(async () => undefined),
      enviarAlerta: vi.fn(async () => Promise.reject(new Error("n8n fora"))),
    };
    const comRegistro = n8nComRegistro(cliente, registro);
    await comRegistro.enviarProposta(proposta);
    await expect(comRegistro.enviarAlerta({ tipo: "x", titulo: "t", mensagem: "m", em: 1 })).rejects.toThrow(
      /n8n fora/,
    );
    expect(registro.registrar.mock.calls).toEqual([
      ["zentrade-aprovacao", true],
      ["zentrade-alertas", false],
    ]);
  });
});
