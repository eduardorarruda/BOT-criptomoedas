import type { Alerta, AlertaEmitido, AvisoDTO, Evento } from "@zentrade/contratos";
import type { NovoAviso } from "@zentrade/banco";
import { describe, expect, it, vi } from "vitest";
import { criarTradutorAlertas } from "./alertas-eventos.js";
import { criarCentralAlertas, JANELA_DEDUP_S } from "./alertas.js";
import { antiReplayMemoria } from "./anti-replay.js";

const ANA = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const BETO = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";
const ROBO = "3f1c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";

/** Os avisos da tela em memória. */
function avisosMemoria() {
  const lista: (AvisoDTO & { usuarioId: string })[] = [];
  return {
    lista,
    gravar: async (usuarioId: string, a: NovoAviso): Promise<AvisoDTO> => {
      const aviso = {
        id: `a${lista.length + 1}`,
        usuarioId,
        tipo: a.tipo,
        gravidade: a.gravidade,
        titulo: a.titulo,
        mensagem: a.mensagem,
        roboId: a.roboId ?? null,
        criadoEm: a.em,
        lidoEm: null,
        enviado: false,
      };
      lista.push(aviso);
      return aviso;
    },
    marcarEnviado: async (_u: string, id: string) => {
      const a = lista.find((x) => x.id === id);
      if (a) a.enviado = true;
    },
    enviadosDesde: async (usuarioId: string, desde: number) =>
      lista.filter((a) => a.usuarioId === usuarioId && a.enviado && a.criadoEm >= desde).length,
  };
}

function montar(o: { falharN8n?: boolean } = {}) {
  let agora = 1_000_000_000;
  const avisos = avisosMemoria();
  const enviados: Alerta[] = [];
  const log = { warn: vi.fn(), error: vi.fn() };
  const central = criarCentralAlertas({
    avisos,
    n8n: {
      enviarAlerta: async (a) => {
        if (o.falharN8n) throw new Error("n8n fora");
        enviados.push(a);
      },
    },
    dedup: antiReplayMemoria(() => agora),
    donoDoRobo: async (id) => (id === ROBO ? ANA : null),
    log,
    agora: () => agora,
  });
  return {
    central,
    avisos,
    enviados,
    log,
    avancar: (ms: number) => {
      agora += ms;
    },
    agora: () => agora,
  };
}

const alerta = (extra: Partial<AlertaEmitido> = {}): AlertaEmitido => ({
  tipo: "robo_nao_ligou",
  gravidade: "critico",
  titulo: "Robô não ligou",
  mensagem: "chave recusada",
  chave: `robo_nao_ligou:${ROBO}`,
  roboId: ROBO,
  em: 1,
  ...extra,
});

describe("central de alertas", () => {
  it("grava o aviso da dona do robô e repassa ao n8n com gravidade e chave", async () => {
    const m = montar();
    expect(await m.central.emitir(alerta())).toBe("novo");
    expect(m.avisos.lista).toMatchObject([
      { usuarioId: ANA, tipo: "robo_nao_ligou", enviado: true, roboId: ROBO },
    ]);
    expect(m.enviados).toEqual([
      {
        tipo: "robo_nao_ligou",
        titulo: "Robô não ligou",
        mensagem: "chave recusada",
        em: 1,
        gravidade: "critico",
        chave: `robo_nao_ligou:${ROBO}`,
      },
    ]);
  });

  it("deduplica o mesmo fato dentro da janela; depois dela, avisa de novo", async () => {
    const m = montar();
    await m.central.emitir(alerta());
    expect(await m.central.emitir(alerta())).toBe("repetido");
    expect(m.avisos.lista).toHaveLength(1);
    m.avancar(JANELA_DEDUP_S.robo_nao_ligou * 1000 + 1);
    expect(await m.central.emitir(alerta())).toBe("novo");
    expect(m.enviados).toHaveLength(2);
  });

  it("a mesma chave para pessoas diferentes não se confunde", async () => {
    const m = montar();
    await m.central.emitir(alerta({ usuarioId: ANA, roboId: undefined, chave: "conta_queda" }));
    await m.central.emitir(alerta({ usuarioId: BETO, roboId: undefined, chave: "conta_queda" }));
    expect(m.avisos.lista.map((a) => a.usuarioId)).toEqual([ANA, BETO]);
  });

  it("sem dona conhecida (robô apagado, usuário local) descarta com aviso no log", async () => {
    const m = montar();
    expect(await m.central.emitir(alerta({ roboId: "outro" }))).toBe("sem_dona");
    expect(await m.central.emitir(alerta({ roboId: undefined, usuarioId: "00000000-local" }))).toBe(
      "sem_dona",
    );
    expect(m.avisos.lista).toHaveLength(0);
    expect(m.log.warn).toHaveBeenCalledTimes(2);
  });

  it("acima do teto por pessoa, o que não é crítico fica só na tela", async () => {
    const m = montar();
    for (let i = 0; i < 12; i++)
      await m.central.emitir(alerta({ gravidade: "atencao", tipo: "ordem_rejeitada", chave: `o${i}` }));
    await m.central.emitir(alerta({ chave: "critico-depois-do-teto" }));
    expect(m.avisos.lista).toHaveLength(13);
    expect(m.enviados).toHaveLength(11);
    expect(m.avisos.lista.filter((a) => !a.enviado).map((a) => a.tipo)).toEqual([
      "ordem_rejeitada",
      "ordem_rejeitada",
    ]);
  });

  it("n8n fora: o aviso fica na tela, sem marca de enviado", async () => {
    const m = montar({ falharN8n: true });
    expect(await m.central.emitir(alerta())).toBe("novo");
    expect(m.avisos.lista[0]?.enviado).toBe(false);
    expect(m.log.error).toHaveBeenCalledOnce();
  });
});

describe("eventos que viram alerta", () => {
  const consultas = {
    descreverRobo: vi.fn(async (id: string) =>
      id === ROBO ? { nome: "BTC devagar", simbolo: "BTCUSDT", usuarioId: ANA } : null,
    ),
    donoDaDecisao: vi.fn(async () => ANA),
    motivoDaDecisao: vi.fn(async (id: string) => (id === "d-stop" ? "stop" : "alvo")),
  };

  function tradutor() {
    const m = montar();
    return { ...m, traduzir: criarTradutorAlertas({ central: m.central, consultas, log: m.log }) };
  }

  const risco = (codigo: string, em = 1): Evento => ({
    tipo: "risco",
    roboId: ROBO,
    barreira: { codigo, mensagem: `mensagem de ${codigo}` },
    em,
  });

  it("perda do dia: um aviso por robô e dia, com a mensagem da barreira", async () => {
    const t = tradutor();
    await t.traduzir(risco("perda_diaria", Date.UTC(2026, 9, 12, 10)));
    await t.traduzir(risco("perda_diaria", Date.UTC(2026, 9, 12, 11)));
    await t.traduzir(risco("perda_diaria", Date.UTC(2026, 9, 13, 1)));
    expect(t.avisos.lista.map((a) => [a.tipo, a.titulo])).toEqual([
      ["perda_diaria_robo", "Perda do dia no limite: BTC devagar"],
      ["perda_diaria_robo", "Perda do dia no limite: BTC devagar"],
    ]);
    expect(t.avisos.lista[0]?.mensagem).toBe("mensagem de perda_diaria");
  });

  it("pausas da conta e da sequência de stops viram alerta; outras barreiras não", async () => {
    const t = tradutor();
    for (const codigo of ["conta_perda_diaria", "conta_queda", "sequencia_stops", "sequencia_stops_robo"])
      await t.traduzir(risco(codigo));
    for (const codigo of ["frequencia", "confianca_baixa", "conta_exposicao", "divergencia_saldo"])
      await t.traduzir(risco(codigo));
    expect(t.avisos.lista.map((a) => a.tipo)).toEqual([
      "perda_diaria_conta",
      "pausa_queda",
      "pausa_sequencia_stops",
      "pausa_sequencia_stops",
    ]);
  });

  const ordem = (estado: "PENDENTE" | "REJEITADA" | "PREENCHIDA", motivo?: string): Evento => ({
    tipo: "ordem",
    ordem: {
      id: "o1",
      decisaoId: "d1",
      idCliente: "zt-1",
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: "0.01",
      estado,
      criadaEm: 5,
      execucoes: [],
      ...(motivo ? { motivo } : {}),
    },
  });

  it("ordem rejeitada e incerta viram alerta; a ordem saindo ou preenchida não", async () => {
    const t = tradutor();
    await t.traduzir(ordem("PENDENTE"));
    await t.traduzir(ordem("PREENCHIDA"));
    await t.traduzir(ordem("REJEITADA", "saldo insuficiente"));
    await t.traduzir(ordem("PENDENTE", "Estado incerto: timeout Confira a ordem zt-1 na corretora."));
    expect(t.avisos.lista.map((a) => [a.tipo, a.gravidade])).toEqual([
      ["ordem_rejeitada", "atencao"],
      ["ordem_incerta", "critico"],
    ]);
    expect(t.avisos.lista[0]?.mensagem).toContain("saldo insuficiente");
  });

  const decisao = (id: string, acao: "VENDER" | "COMPRAR", estado: "executada" | "registrada"): Evento => ({
    tipo: "decisao",
    decisao: {
      id,
      roboId: ROBO,
      em: 9,
      sinal: { acao, explicacao: "preço abaixo do stop" },
      preco: "58800",
      risco: { aprovada: true, barreiras: [] },
      estado,
    },
  });

  it("stop atingido: só a venda executada com motivo stop", async () => {
    const t = tradutor();
    await t.traduzir(decisao("d-stop", "VENDER", "registrada"));
    await t.traduzir(decisao("d-alvo", "VENDER", "executada"));
    await t.traduzir(decisao("d-stop", "COMPRAR", "executada"));
    await t.traduzir(decisao("d-stop", "VENDER", "executada"));
    await t.traduzir(decisao("d-stop", "VENDER", "executada"));
    expect(t.avisos.lista.map((a) => [a.tipo, a.titulo])).toEqual([
      ["stop_atingido", "Stop atingido: BTC devagar"],
    ]);
  });

  it("alertas prontos do motor e do agente passam pela central; erro vai para o log", async () => {
    const t = tradutor();
    await t.traduzir({ tipo: "alerta", alerta: alerta() });
    expect(t.avisos.lista).toHaveLength(1);
    consultas.descreverRobo.mockRejectedValueOnce(new Error("banco fora"));
    await expect(t.traduzir(risco("conta_queda"))).resolves.toBeUndefined();
    expect(t.log.error).toHaveBeenCalledOnce();
    await t.traduzir({ tipo: "preco", simbolo: "BTCUSDT", preco: "1", em: 1 });
    expect(t.avisos.lista).toHaveLength(1);
  });
});
