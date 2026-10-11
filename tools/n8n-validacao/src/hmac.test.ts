import { assinar, verificar } from "@zentrade/contratos";
import { describe, expect, it } from "vitest";
import { carregarFluxo, codigoDo, no, type FluxoN8n } from "./fluxos.js";
import { executarCodigo, noCryptoHmac, type Item } from "./sandbox.js";

/**
 * O HMAC dos fluxos é feito em três passos (Code → Crypto → Code). Aqui a cadeia
 * roda fora do n8n e o resultado é comparado com assinar()/verificar() de
 * @zentrade/contratos para um exemplo fixo e para os casos de borda.
 */
const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres";
const AGORA = 1_760_000_000_000;
const CORPO = JSON.stringify({
  decisaoId: "dec-42",
  roboId: "robo-btc",
  simbolo: "BTCUSDT",
  acao: "COMPRAR",
  quantidade: "0.00123",
  preco: "62000.5",
  resumo: "RSI saiu de sobrevenda com a média subindo — ação",
  expiraEm: AGORA + 240_000,
});

/**
 * Assinatura do exemplo fixo calculada fora do Node, para o teste não depender só de si mesmo:
 * printf '1760000000.<CORPO>' | openssl dgst -sha256 -hmac '<SEGREDO>'
 */
const ASSINATURA_FIXA = "t=1760000000,v1=1a33985fad2a6cd236d3f817316e8b922183fc8db6e23f1656082f6355d79ffd";

async function verificarNoFluxo(
  fluxo: FluxoN8n,
  corpo: string,
  cabecalho: string | undefined,
  segredo: string,
  agoraMs: number,
): Promise<{ valida: boolean; dados: unknown }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cabecalho !== undefined) headers["x-zentrade-assinatura"] = cabecalho;
  const [preparado] = await executarCodigo(codigoDo(fluxo, "Preparar verificação"), {
    entrada: [{ json: { headers, params: {}, query: {}, body: {}, corpoBruto: corpo } }],
    agoraMs,
  });
  const comHmac = noCryptoHmac(preparado as Item, "mensagem", "esperada", segredo);
  const [conferido] = await executarCodigo(codigoDo(fluxo, "Conferir assinatura"), {
    entrada: [comHmac],
    agoraMs,
  });
  return conferido?.json as { valida: boolean; dados: unknown };
}

const valido = assinar(CORPO, SEGREDO, AGORA);
const v1 = valido.split("v1=")[1] as string;
const t = Math.floor(AGORA / 1000);

const CASOS: readonly (readonly [string, string, string | undefined, string, number])[] = [
  ["assinatura válida", CORPO, valido, SEGREDO, AGORA],
  ["válida 299 s depois", CORPO, valido, SEGREDO, AGORA + 299_000],
  ["válida 300 s antes (relógio adiantado)", CORPO, valido, SEGREDO, AGORA - 300_000],
  ["vencida 301 s depois", CORPO, valido, SEGREDO, AGORA + 301_000],
  ["do futuro além do prazo", CORPO, valido, SEGREDO, AGORA - 301_000],
  ["corpo alterado", `${CORPO} `, valido, SEGREDO, AGORA],
  ["segredo errado", CORPO, valido, "x".repeat(40), AGORA],
  ["sem cabeçalho", CORPO, undefined, SEGREDO, AGORA],
  ["cabeçalho vazio", CORPO, "", SEGREDO, AGORA],
  ["cabeçalho torto", CORPO, "t=abc,v1=zz", SEGREDO, AGORA],
  ["hex em maiúsculas", CORPO, `t=${t},v1=${v1.toUpperCase()}`, SEGREDO, AGORA],
  ["hex curto", CORPO, `t=${t},v1=${v1.slice(1)}`, SEGREDO, AGORA],
  ["ordem invertida", CORPO, `v1=${v1},t=${t}`, SEGREDO, AGORA],
  ["parte extra", CORPO, `${valido},v0=abc`, SEGREDO, AGORA],
  ["carimbo com zero à esquerda", CORPO, `t=0${t},v1=${v1}`, SEGREDO, AGORA],
  ["carimbo fracionário", CORPO, `t=${t}.5,v1=${v1}`, SEGREDO, AGORA],
  ["espaço depois da vírgula", CORPO, `t=${t}, v1=${v1}`, SEGREDO, AGORA],
  ["corpo vazio assinado", "", assinar("", SEGREDO, AGORA), SEGREDO, AGORA],
  [
    "corpo com acentos e emoji",
    '{"texto":"ação 🚀"}',
    assinar('{"texto":"ação 🚀"}', SEGREDO, AGORA),
    SEGREDO,
    AGORA,
  ],
];

describe("assinar() de referência", () => {
  it("bate com o valor calculado pelo openssl para o exemplo fixo", () => {
    expect(valido).toBe(ASSINATURA_FIXA);
  });
});

describe.each(["zentrade-aprovacao", "zentrade-alertas"])("verificação no fluxo %s", (nome) => {
  const fluxo = carregarFluxo(nome);

  it("aceita o exemplo fixo com a assinatura do openssl", async () => {
    expect((await verificarNoFluxo(fluxo, CORPO, ASSINATURA_FIXA, SEGREDO, AGORA + 5000)).valida).toBe(true);
  });

  it.each(CASOS)("%s: mesmo veredito que verificar()", async (_caso, corpo, cabecalho, segredo, agora) => {
    const esperado = verificar(corpo, cabecalho, segredo, agora);
    const r = await verificarNoFluxo(fluxo, corpo, cabecalho, segredo, agora);
    expect(r.valida).toBe(esperado);
  });

  it("só interpreta o corpo quando a assinatura confere", async () => {
    expect((await verificarNoFluxo(fluxo, CORPO, valido, SEGREDO, AGORA)).dados).toEqual(JSON.parse(CORPO));
    expect((await verificarNoFluxo(fluxo, CORPO, valido, "x".repeat(40), AGORA)).dados).toBeNull();
  });
});

it("os nós de verificação são idênticos nos dois fluxos (sem divergência)", () => {
  const a = carregarFluxo("zentrade-aprovacao");
  const b = carregarFluxo("zentrade-alertas");
  for (const nome of ["Preparar verificação", "Conferir assinatura"])
    expect(codigoDo(a, nome)).toBe(codigoDo(b, nome));
  expect(no(a, "Calcular HMAC").parameters).toEqual(no(b, "Calcular HMAC").parameters);
});

/** Monta o cabeçalho como o nó HTTP Request faz, a partir do item assinado pelo Crypto. */
function cabecalhoDoHttp(fluxo: FluxoN8n, nomeHttp: string, item: Item): string {
  const expr = (
    no(fluxo, nomeHttp).parameters.headerParameters as { parameters: { name: string; value: string }[] }
  ).parameters[0]?.value;
  expect(expr).toBe("={{ 't=' + $json.carimbo + ',v1=' + $json.assinatura }}");
  return `t=${String(item.json.carimbo)},v1=${String(item.json.assinatura)}`;
}

describe("assinatura do que o n8n envia à API", () => {
  it("vigia de saúde: corpo vazio, igual a assinar('')", async () => {
    const fluxo = carregarFluxo("zentrade-vigia-saude");
    const [item] = await executarCodigo(codigoDo(fluxo, "Preparar sinal"), { agoraMs: AGORA });
    const assinado = noCryptoHmac(item as Item, "mensagem", "assinatura", SEGREDO);
    const cab = cabecalhoDoHttp(fluxo, "Perguntar saúde", assinado);
    expect(cab).toBe(assinar("", SEGREDO, AGORA));
    expect(verificar("", cab, SEGREDO, AGORA + 1000)).toBe(true);
  });

  it("aprovação: RespostaAprovacao assinada igual a assinar()", async () => {
    const fluxo = carregarFluxo("zentrade-aprovacao");
    const proposta = JSON.parse(CORPO) as Record<string, unknown>;
    const [item] = await executarCodigo(codigoDo(fluxo, "Montar resposta"), {
      entrada: [{ json: { data: { approved: true, responder: { id: "1", username: "operador" } } } }],
      nos: { "Ler proposta": [{ json: { proposta } }] },
      agoraMs: AGORA,
    });
    const assinado = noCryptoHmac(item as Item, "mensagem", "assinatura", SEGREDO);
    const corpo = String(assinado.json.corpo);
    expect(no(fluxo, "Enviar resposta à API").parameters.body).toBe("={{ $json.corpo }}");
    expect(cabecalhoDoHttp(fluxo, "Enviar resposta à API", assinado)).toBe(assinar(corpo, SEGREDO, AGORA));
  });

  it("notícias: cada item assinado igual a assinar()", async () => {
    const fluxo = carregarFluxo("zentrade-noticias");
    const itens = await executarCodigo(codigoDo(fluxo, "Resumir e filtrar"), {
      entrada: [
        {
          json: {
            title: "Bitcoin sobe",
            link: "https://exemplo.com/a",
            isoDate: new Date(AGORA - 60_000).toISOString(),
            contentSnippet: "Resumo",
          },
        },
      ],
      nos: { "Anúncios da Binance": [{ json: {} }] },
      agoraMs: AGORA,
    });
    expect(itens).toHaveLength(1);
    for (const item of itens) {
      const assinado = noCryptoHmac(item, "mensagem", "assinatura", SEGREDO);
      const corpo = String(assinado.json.corpo);
      expect(cabecalhoDoHttp(fluxo, "Enviar ao conhecimento", assinado)).toBe(assinar(corpo, SEGREDO, AGORA));
    }
  });
});
