import type { Banco, NegociacaoCarteiraLida } from "@zentrade/banco";
import {
  MOEDA_REFERENCIA,
  type Carteira,
  type CarteiraAtivo,
  type CredenciaisCorretora,
  type NegociacaoCarteira,
  type PedidoSincronizacao,
  type RedeConta,
  type Sincronizacao,
  type StatusBinance,
} from "@zentrade/contratos";
import { calcularCarteira, dinheiro, precosUsdtDaTabela, type RestricoesChave } from "@zentrade/corretora";
import { dec, type Valor } from "@zentrade/dominio";
import { ErroApi, naoEncontrado } from "../erros.js";
import {
  contaNaoEncontrada,
  erroDaBinance,
  fabricaContaBinance,
  type ContaLeitura,
  type FabricaConta,
} from "./binance-conta.js";
import { sincronizarConta } from "./binance-sincronizacao.js";
import { statusDasContas } from "./binance-status.js";

export interface DependenciasCarteira {
  readonly banco: Pick<Banco, "contas" | "credenciais" | "carteira" | "robos">;
  readonly criarConta: FabricaConta;
  readonly agora: () => number;
  readonly log?: { warn(obj: object, msg: string): void };
  /** Por quanto tempo a tabela de preços atuais vale (padrão 10 s). */
  readonly validadePrecosMs?: number;
}

/** A carteira da Binance de cada pessoa: leitura (calculada na hora), sincronização e status. */
export interface ServicoCarteira {
  carteira(usuarioId: string, rede?: RedeConta): Promise<Carteira>;
  ativo(usuarioId: string, ativo: string, rede?: RedeConta): Promise<CarteiraAtivo>;
  sincronizar(usuarioId: string, pedido: PedidoSincronizacao): Promise<Sincronizacao>;
  status(usuarioId: string): Promise<StatusBinance>;
  /** Reais por USDT na tabela de preços da rede (a mesma da carteira, em cache); null se não houver. */
  cambioReais(usuarioId: string, rede: RedeConta): Promise<CambioReais | null>;
  /** Uma pessoa e rede por vez (o peso da Binance é por IP). Falha de uma não para as outras. */
  sincronizarTodos(): Promise<void>;
  /** Permissões de uma chave ainda não salva (só a rede real informa; a testnet devolve null). */
  restricoesDaChave(rede: RedeConta, credenciais: CredenciaisCorretora): Promise<RestricoesChave | null>;
}

export interface CambioReais {
  readonly preco: Valor;
  /** Quando a tabela de preços foi lida. */
  readonly em: number;
}

const VALIDADE_PRECOS_MS = 10_000;

const RESUMO_VAZIO = {
  custoComprado: "0",
  custoPosicao: "0",
  valorAtual: "0",
  resultadoRealizadoBruto: "0",
  resultadoRealizadoLiquido: "0",
  resultadoNaoRealizado: "0",
  resultadoBruto: "0",
  resultadoLiquido: "0",
  taxas: "0",
  retorno: null,
};

const carteiraVazia = (): Carteira => ({
  conectada: false,
  rede: null,
  redes: [],
  moedaReferencia: MOEDA_REFERENCIA,
  sincronizacao: null,
  precosEm: null,
  resumo: {
    robo: RESUMO_VAZIO,
    manual: RESUMO_VAZIO,
    total: RESUMO_VAZIO,
    valorConta: "0",
    valorSemCusto: "0",
    caixa: "0",
  },
  moedas: [],
  avisos: [],
});

/** Reais por 1 USDT: o par USDTBRL, ou o inverso de BRLUSDT. Sem par (ou zero), null. */
export function reaisPorUsdtDaTabela(tabela: ReadonlyMap<string, Valor>): Valor | null {
  const direto = tabela.get(`${MOEDA_REFERENCIA}BRL`);
  if (direto?.gt(0)) return direto;
  const invertido = tabela.get(`BRL${MOEDA_REFERENCIA}`);
  return invertido?.gt(0) ? dec(1).div(invertido) : null;
}

const opcional = (v: Valor | null): string | null => (v === null ? null : dinheiro(v));

export function negociacaoDto(n: NegociacaoCarteiraLida): NegociacaoCarteira {
  return {
    id: n.id,
    simbolo: n.simbolo,
    base: n.base,
    cotacao: n.cotacao,
    lado: n.lado,
    preco: dinheiro(n.preco),
    quantidade: dinheiro(n.quantidade),
    valorCotacao: dinheiro(n.valorCotacao),
    taxa: dinheiro(n.taxa),
    ativoTaxa: n.ativoTaxa,
    taxaUsdt: opcional(n.taxaUsdt),
    cotacaoUsdt: opcional(n.cotacaoUsdt),
    origem: n.origem,
    idOrdem: n.idOrdem,
    em: n.em,
  };
}

/** Real primeiro quando houver: é a carteira que importa. A testnet fica a um clique. */
const redePadrao = (redes: readonly RedeConta[]): RedeConta => (redes.includes("real") ? "real" : "testnet");

export function criarServicoCarteira(d: DependenciasCarteira): ServicoCarteira {
  const { banco } = d;
  const validade = d.validadePrecosMs ?? VALIDADE_PRECOS_MS;
  let precos: ReadonlyMap<RedeConta, { em: number; tabela: Promise<Map<string, Valor>> }> = new Map();
  let ocupadas: ReadonlySet<string> = new Set();

  async function redesDe(usuarioId: string): Promise<RedeConta[]> {
    return [...new Set((await banco.contas.listar(usuarioId)).map((c) => c.rede))];
  }

  async function resolverRede(usuarioId: string, pedida?: RedeConta) {
    const redes = await redesDe(usuarioId);
    if (redes.length === 0) return null;
    const rede = pedida ?? redePadrao(redes);
    if (!redes.includes(rede)) throw contaNaoEncontrada(rede);
    return { rede, redes };
  }

  async function contaDe(usuarioId: string, rede: RedeConta): Promise<ContaLeitura> {
    const credenciais = await banco.credenciais.binance(usuarioId, rede).catch((e: unknown) => {
      throw erroDaBinance(e);
    });
    if (!credenciais) throw contaNaoEncontrada(rede);
    return d.criarConta(rede, credenciais);
  }

  /** Tabela de preços atuais por rede, num cache curto: preço é público e igual para todos. */
  function tabelaDe(rede: RedeConta, conta: ContaLeitura): Promise<Map<string, Valor>> {
    const agora = d.agora();
    const atual = precos.get(rede);
    if (atual && agora - atual.em < validade) return atual.tabela;
    const tabela = conta.tabelaPrecos();
    precos = new Map([...precos, [rede, { em: agora, tabela }]]);
    tabela.catch(() => (precos = new Map([...precos].filter(([r]) => r !== rede))));
    return tabela;
  }

  async function precosAtuais(usuarioId: string, rede: RedeConta, ativos: readonly string[]) {
    try {
      const tabela = await tabelaDe(rede, await contaDe(usuarioId, rede));
      return {
        precos: precosUsdtDaTabela(tabela, ativos),
        em: precos.get(rede)?.em ?? d.agora(),
        avisos: [],
      };
    } catch (erro) {
      const motivo = erroDaBinance(erro).message;
      return {
        precos: new Map<string, Valor>(),
        em: null,
        avisos: [
          `Preços atuais indisponíveis (${motivo}). Valor atual e resultado não realizado aparecem como desconhecidos.`,
        ],
      };
    }
  }

  async function calcular(usuarioId: string, rede: RedeConta) {
    const [saldos, negociacoes, sincronizacao] = await Promise.all([
      banco.carteira.saldos(usuarioId, rede),
      banco.carteira.negociacoes(usuarioId, rede),
      banco.carteira.sincronizacao(usuarioId, rede),
    ]);
    const ativos = [
      ...new Set([
        ...saldos.map((s) => s.ativo),
        ...negociacoes.flatMap((n) => [n.base, n.cotacao, n.ativoTaxa]),
      ]),
    ];
    const p = await precosAtuais(usuarioId, rede, ativos);
    const resultado = calcularCarteira({
      negociacoes,
      saldos: new Map(saldos.map((s) => [s.ativo, s])),
      precos: p.precos,
    });
    return { resultado, sincronizacao, precosEm: p.em, avisos: p.avisos };
  }

  async function carteira(usuarioId: string, pedida?: RedeConta): Promise<Carteira> {
    const contexto = await resolverRede(usuarioId, pedida);
    if (!contexto) return carteiraVazia();
    const { resultado, sincronizacao, precosEm, avisos } = await calcular(usuarioId, contexto.rede);
    const naoSincronizada = sincronizacao
      ? []
      : [
          "Conta ainda não sincronizada: use “Sincronizar agora” para importar saldos e negociações da Binance.",
        ];
    return {
      conectada: true,
      rede: contexto.rede,
      redes: contexto.redes,
      moedaReferencia: MOEDA_REFERENCIA,
      sincronizacao: sincronizacao
        ? {
            em: sincronizacao.em,
            ok: sincronizacao.ok,
            erro: sincronizacao.erro,
            negociacoes: sincronizacao.negociacoes,
          }
        : null,
      precosEm,
      resumo: resultado.resumo,
      moedas: resultado.moedas,
      avisos: [...naoSincronizada, ...avisos, ...resultado.avisos],
    };
  }

  async function ativo(usuarioId: string, simboloAtivo: string, pedida?: RedeConta): Promise<CarteiraAtivo> {
    const contexto = await resolverRede(usuarioId, pedida);
    if (!contexto) throw contaNaoEncontrada(pedida ?? "real");
    const { resultado, precosEm } = await calcular(usuarioId, contexto.rede);
    const moeda = resultado.moedas.find((m) => m.ativo === simboloAtivo);
    if (!moeda) throw naoEncontrado("moeda na carteira");
    const negociacoes = await banco.carteira.negociacoes(usuarioId, contexto.rede, simboloAtivo);
    return { rede: contexto.rede, precosEm, moeda, negociacoes: negociacoes.map(negociacaoDto).reverse() };
  }

  async function sincronizar(usuarioId: string, pedido: PedidoSincronizacao): Promise<Sincronizacao> {
    const contexto = await resolverRede(usuarioId, pedido.rede);
    if (!contexto) throw contaNaoEncontrada(pedido.rede ?? "testnet");
    const chave = `${usuarioId}:${contexto.rede}`;
    if (ocupadas.has(chave))
      throw new ErroApi(
        409,
        "sincronizacao_em_andamento",
        "a carteira já está sincronizando; espere terminar",
      );
    ocupadas = new Set([...ocupadas, chave]);
    try {
      const conta = await contaDe(usuarioId, contexto.rede);
      const robos = (await banco.robos.listar(usuarioId))
        .filter((r) => r.rede === contexto.rede)
        .map((r) => r.simbolo);
      const ctx = { conta, carteira: banco.carteira, agora: d.agora };
      return await sincronizarConta(ctx, {
        usuarioId,
        rede: contexto.rede,
        extras: pedido.simbolos ?? [],
        robos,
      });
    } finally {
      ocupadas = new Set([...ocupadas].filter((c) => c !== chave));
    }
  }

  async function status(usuarioId: string): Promise<StatusBinance> {
    const contas = await banco.contas.listar(usuarioId);
    const deps = { credenciais: banco.credenciais, carteira: banco.carteira, criarConta: d.criarConta };
    return { contas: await statusDasContas(deps, usuarioId, contas) };
  }

  async function cambioReais(usuarioId: string, rede: RedeConta): Promise<CambioReais | null> {
    try {
      const tabela = await tabelaDe(rede, await contaDe(usuarioId, rede));
      const preco = reaisPorUsdtDaTabela(tabela);
      return preco ? { preco, em: precos.get(rede)?.em ?? d.agora() } : null;
    } catch (erro) {
      d.log?.warn({ err: erro, usuarioId, rede }, "cotação USDT/BRL indisponível");
      return null;
    }
  }

  async function sincronizarTodos(): Promise<void> {
    for (const { usuarioId, rede } of await banco.carteira.contasParaSincronizar()) {
      try {
        await sincronizar(usuarioId, { rede });
      } catch (erro) {
        d.log?.warn({ err: erro, usuarioId, rede }, "sincronização periódica da carteira falhou");
      }
    }
  }

  return {
    carteira,
    ativo,
    sincronizar,
    status,
    cambioReais,
    sincronizarTodos,
    restricoesDaChave: (rede, credenciais) => d.criarConta(rede, credenciais).restricoes(),
  };
}

const servicos = new WeakMap<object, ServicoCarteira>();

/**
 * O serviço da carteira das dependências (o injetado, nos testes) ou o padrão, com a
 * Binance de verdade. Um só por API: as rotas da carteira e do status dividem o cache
 * de preços e a trava de sincronização.
 */
export function servicoCarteiraDe(
  deps: {
    readonly carteira?: ServicoCarteira;
    readonly banco: DependenciasCarteira["banco"];
    readonly agora: () => number;
  },
  log?: DependenciasCarteira["log"],
): ServicoCarteira {
  if (deps.carteira) return deps.carteira;
  const existente = servicos.get(deps);
  if (existente) return existente;
  const novo = criarServicoCarteira({
    banco: deps.banco,
    criarConta: fabricaContaBinance(),
    agora: deps.agora,
    ...(log ? { log } : {}),
  });
  servicos.set(deps, novo);
  return novo;
}
