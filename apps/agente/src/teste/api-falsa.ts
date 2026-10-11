import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { DecisaoDTO } from "@zentrade/contratos";

export const TOKEN_TESTE = "token-de-teste-nao-real";

export const DECISOES: DecisaoDTO[] = [
  {
    id: "dec-2",
    roboId: "robo-1",
    em: Date.UTC(2026, 9, 10, 14, 30),
    sinal: { acao: "COMPRAR", explicacao: "Preço 2% abaixo da SMA de 20." },
    proposta: {
      acao: "comprar",
      confianca: 0.72,
      tamanhoRelativo: 0.5,
      stop: "58800",
      alvo: "61000",
      justificativa: "Reversão à média com RSI baixo; notícia neutra.",
      riscos: ["queda do BTC continuar"],
      fontes: [{ tipo: "diario", id: "dec-1", titulo: "Decisão dec-1", data: "2026-10-01" }],
    },
    quantidade: "0.0012",
    preco: "60000",
    risco: {
      aprovada: false,
      barreiras: [{ codigo: "exposicao", mensagem: "A exposição passaria do máximo." }],
    },
    estado: "barrada",
    custoIaUsd: "0.0213",
  },
  {
    id: "dec-1",
    roboId: "robo-2",
    em: Date.UTC(2026, 9, 1, 9, 0),
    sinal: { acao: "VENDER", explicacao: "Alvo atingido." },
    preco: "61000.5",
    risco: { aprovada: true, barreiras: [] },
    estado: "executada",
    desfecho: { resultado: "3.2", avaliadoEm: Date.UTC(2026, 9, 1, 10, 0) },
  },
];

export interface ApiFalsa {
  readonly url: string;
  readonly pedidos: { metodo: string; caminho: string; corpo: unknown }[];
  fechar(): Promise<void>;
}

const RESUMO = {
  resultadoHoje: "-12.5",
  exposicao: "604.5",
  maiorQueda30d: "48.1",
  robosAtivos: 2,
  custoIaHoje: "0.43",
  taxasHoje: "1.2",
  paradaTotal: false,
};

const BACKTEST = {
  id: "bt-1",
  estado: "na_fila",
  estrategiaId: "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59",
  versao: 2,
  simbolo: "BTCUSDT",
  intervalo: "1h",
  inicio: Date.UTC(2026, 0, 1),
  fim: Date.UTC(2026, 5, 1),
  metricas: null,
  curva: null,
  erro: null,
  criadoEm: Date.UTC(2026, 6, 1),
  concluidoEm: null,
};

const METRICAS = {
  resultadoLiquido: "42",
  maiorQueda: "18.5",
  maiorQuedaPercentual: 0.0185,
  operacoes: 17,
  acertos: 9,
  taxaAcerto: 0.5294,
  taxasPagas: "6.8",
};

function responder(res: ServerResponse, status: number, corpo: unknown) {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(corpo));
}

const naoEncontrado = (o: string) => ({ erro: { codigo: "nao_encontrado", mensagem: `${o} não existe.` } });

function rotear(metodo: string, url: URL, corpo: unknown): [number, unknown] {
  const caminho = url.pathname;
  if (metodo === "GET" && caminho === "/api/v1/resumo") return [200, RESUMO];
  if (metodo === "GET" && caminho === "/api/v1/decisoes") {
    const robo = url.searchParams.get("roboId");
    const limite = Number(url.searchParams.get("limite") ?? 50);
    return [200, DECISOES.filter((d) => !robo || d.roboId === robo).slice(0, limite)];
  }
  const decisao = caminho.match(/^\/api\/v1\/decisoes\/([^/]+)$/);
  if (metodo === "GET" && decisao) {
    const d = DECISOES.find((x) => x.id === decodeURIComponent(decisao[1] ?? ""));
    return d ? [200, d] : [404, naoEncontrado("A decisão")];
  }
  if (metodo === "POST" && caminho === "/api/v1/parada-total") {
    const ligada = (corpo as { ligada?: boolean }).ligada;
    if (ligada === false) {
      return [
        403,
        { erro: { codigo: "reautenticacao", mensagem: "Desligar a parada total exige confirmar a senha." } },
      ];
    }
    return [200, { ligada: true }];
  }
  if (metodo === "POST" && caminho === "/api/v1/backtests") return [202, BACKTEST];
  if (metodo === "GET" && caminho === "/api/v1/backtests/bt-1") {
    const curva = [{ em: BACKTEST.inicio, patrimonio: "1000" }];
    return [200, { ...BACKTEST, estado: "concluido", metricas: METRICAS, curva, concluidoEm: BACKTEST.fim }];
  }
  return [404, naoEncontrado("A rota")];
}

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = [];
  for await (const p of req) partes.push(p as Buffer);
  const texto = Buffer.concat(partes).toString();
  return texto ? JSON.parse(texto) : null;
}

/** API do ZenTrade de mentira, só com as rotas que a CLI e o MCP usam. */
export async function subirApiFalsa(): Promise<ApiFalsa> {
  const pedidos: ApiFalsa["pedidos"] = [];
  const servidor: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const corpo = await lerCorpo(req);
      pedidos.push({ metodo: req.method ?? "", caminho: `${url.pathname}${url.search}`, corpo });
      if (req.headers.authorization !== `Bearer ${TOKEN_TESTE}`) {
        return responder(res, 401, { erro: { codigo: "nao_autenticado", mensagem: "Token inválido." } });
      }
      const [status, resposta] = rotear(req.method ?? "", url, corpo);
      return responder(res, status, resposta);
    })();
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  const { port } = servidor.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    pedidos,
    fechar: () => new Promise((ok, falhar) => servidor.close((e) => (e ? falhar(e) : ok()))),
  };
}
