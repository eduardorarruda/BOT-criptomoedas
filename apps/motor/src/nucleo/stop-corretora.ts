import type {
  NovaDecisao,
  PernaProtecao,
  PortaProtecoes,
  ProtecaoGravada,
  ResultadoProtecao,
  RoboConfig,
} from "@zentrade/contratos";
import { ativosDoSimbolo } from "@zentrade/corretora";
import {
  arredondarParaBaixo,
  dec,
  formatarNumero,
  paraTexto,
  posicaoDe,
  type FiltrosAtivo,
  type Posicao,
  type Valor,
} from "@zentrade/dominio";
import { randomUUID } from "node:crypto";
import { idsProtecaoDe } from "../id-cliente.js";
import { publicarPosicao } from "./aovivo.js";
import { decisaoDTO, publicar } from "./diario.js";
import { ordemDTO } from "./execucao.js";
import { gravarDesfecho, type ProtecaoEfetiva } from "./posicao-aberta.js";
import type { Dependencias } from "./tipos.js";

/**
 * Stop na corretora: depois da compra, o stop e o alvo efetivos da posição ficam no
 * livro da corretora (OCO; stop-limit sozinho se o alvo já passou) e valem mesmo com o
 * motor fora do ar. O robô segue vigiando no fechamento de cada minuto, como segunda
 * linha de defesa. Regras (ADR 007):
 * - A cada candle o motor confere a proteção viva e grava o que ela executou como a
 *   venda que fecha a posição — uma vez só (registrarSaida é idempotente pela perna).
 * - Proteção diferente da desejada (stop efetivo mudou, quantidade mudou) é cancelada e
 *   colocada de novo; o banco guarda uma viva por robô.
 * - O robô só vende por conta própria depois de tirar a proteção do livro: a proteção
 *   trava a base, e vender com ela no livro seria vender duas vezes.
 */

const RECUSA_ESPERA_MS = 5 * 60_000;

/** Para cima no passo (o stop e o alvo nunca ficam piores que os efetivos por arredondamento). */
const arredondarParaCima = (valor: Valor, passo: Valor): Valor => valor.div(passo).ceil().times(passo);

const precoMedio = (perna: PernaProtecao): Valor => {
  const execucoes = perna.ordem.execucoes;
  const quantidade = execucoes.reduce((t, e) => t.plus(e.quantidade), dec(0));
  const valor = execucoes.reduce((t, e) => t.plus(e.quantidade.times(e.preco)), dec(0));
  return quantidade.isZero() ? dec(0) : valor.div(quantidade);
};

function decisaoDaSaida(
  deps: Dependencias,
  robo: RoboConfig,
  perna: PernaProtecao,
  quantidade: Valor,
): NovaDecisao {
  const preco = precoMedio(perna);
  const nome = perna.perna === "alvo" ? "Alvo" : "Stop";
  return {
    roboId: robo.id,
    em: deps.relogio.agora(),
    sinal: {
      acao: "VENDER",
      motivo: perna.perna,
      explicacao: `${nome} executado na corretora (ordem ${perna.ordem.idCorretora ?? perna.ordem.idCliente}) a ${formatarNumero(preco)}.`,
    },
    preco,
    quantidade,
    risco: { aprovada: true, barreiras: [] },
    estado: "executada",
  };
}

/** Grava a venda de uma perna (decisão, ordem e execuções) e avisa a tela. */
async function gravarPerna(
  deps: Dependencias,
  porta: PortaProtecoes,
  robo: RoboConfig,
  viva: ProtecaoGravada,
  perna: PernaProtecao,
): Promise<void> {
  const executada = perna.ordem.execucoes.reduce((t, e) => t.plus(e.quantidade), dec(0));
  const decisao = decisaoDaSaida(deps, robo, perna, executada);
  const { decisaoId, nova } = await porta.registrarSaida(viva.ids.lista, {
    decisao,
    ordem: perna.ordem,
    quantidade: viva.quantidade,
  });
  if (nova)
    await publicar(deps, {
      tipo: "decisao",
      decisao: decisaoDTO({ id: decisaoId, decisao, ordemId: perna.ordem.idCliente }),
    });
  await publicar(deps, {
    tipo: "ordem",
    ordem: ordemDTO(decisaoId, robo, "VENDA", viva.quantidade, perna.ordem, viva.criadaEm),
  });
}

const motivoSumiu = (viva: ProtecaoGravada): string =>
  viva.estado === "PENDENTE"
    ? "O envio da proteção não chegou à corretora (ela não consta lá); outra é colocada."
    : "A proteção não consta mais no livro da corretora (cancelada por fora?); outra é colocada.";

/**
 * Aplica o que a corretora disse sobre a proteção viva: grava as execuções de cada perna
 * como venda e o estado novo. Se a posição zerou por ela, grava o desfecho na compra.
 * Devolve true se a posição mudou.
 */
export async function aplicarProtecao(
  deps: Dependencias,
  robo: RoboConfig,
  viva: ProtecaoGravada,
  r: ResultadoProtecao | null,
): Promise<boolean> {
  const porta = deps.protecoes;
  if (!porta) return false;
  if (!r) {
    await porta.atualizar(viva.ids.lista, viva.estado === "PENDENTE" ? "REJEITADA" : "CANCELADA", {
      motivo: motivoSumiu(viva),
    });
    deps.registro.warn({ roboId: robo.id, lista: viva.ids.lista }, motivoSumiu(viva));
    await publicarPosicao(deps, robo);
    return false;
  }
  const antes = posicaoDe(await deps.ordens.execucoes(robo.id)).quantidade;
  for (const perna of r.pernas)
    if (perna.ordem.execucoes.length > 0) await gravarPerna(deps, porta, robo, viva, perna);
  const depois = posicaoDe(await deps.ordens.execucoes(robo.id)).quantidade;
  const mudou = r.estado !== viva.estado || r.idCorretora !== viva.idCorretora;
  if (mudou)
    await porta.atualizar(viva.ids.lista, r.estado, {
      idCorretora: r.idCorretora,
      ...(r.motivo ? { motivo: r.motivo } : {}),
    });
  const executou = !antes.equals(depois);
  if (executou && depois.isZero() && antes.gt(0)) await gravarDesfecho(deps, robo.id, viva.decisaoId);
  if (executou || mudou) await publicarPosicao(deps, robo);
  if (executou)
    deps.registro.info(
      { roboId: robo.id, lista: viva.ids.lista, vendida: paraTexto(antes.minus(depois)) },
      "proteção executada na corretora: venda gravada",
    );
  return executou;
}

/** Confere a proteção viva na corretora e grava o que ela executou. true se a posição mudou. */
export async function conferirProtecao(deps: Dependencias, robo: RoboConfig): Promise<boolean> {
  const viva = await deps.protecoes?.viva(robo.id);
  if (!viva) return false;
  const r = await deps.corretora.consultarProtecao(robo.simbolo, viva.ids);
  return aplicarProtecao(deps, robo, viva, r);
}

/**
 * Antes de o robô vender: tira a proteção do livro e grava o que ela já executou.
 * "presa" = não deu para confirmar que saiu do livro: não vender (a base está travada
 * nela, e ela segue protegendo); tenta de novo no próximo candle.
 */
export async function liberarProtecao(deps: Dependencias, robo: RoboConfig): Promise<"livre" | "presa"> {
  const viva = await deps.protecoes?.viva(robo.id);
  if (!viva) return "livre";
  let r: ResultadoProtecao | null;
  try {
    r = await deps.corretora.cancelarProtecao(robo.simbolo, viva.ids);
  } catch (erro) {
    deps.registro.error(
      { erro, roboId: robo.id, lista: viva.ids.lista },
      "não deu para tirar a proteção do livro da corretora: a venda do robô espera",
    );
    return "presa";
  }
  await aplicarProtecao(deps, robo, viva, r);
  return r?.estado === "ATIVA" ? "presa" : "livre";
}

interface Desejada extends ProtecaoEfetiva {
  readonly quantidade: Valor;
  readonly limite: Valor;
  /** Só se ainda estiver acima do preço de agora (senão, stop sozinho). */
  readonly alvoNoLivro?: Valor;
}

const chave = (decisaoId: string, valores: readonly (Valor | undefined)[]): string =>
  [decisaoId, ...valores.map((v) => (v ? paraTexto(v) : "-"))].join("|");

/** Mesma chave = mesma proteção: nada a trocar. */
const chaveDe = (d: Desejada): string => chave(d.decisaoId, [d.quantidade, d.stop, d.limite, d.alvoNoLivro]);
const chaveDaViva = (v: ProtecaoGravada): string =>
  chave(v.decisaoId, [v.quantidade, v.stop, v.limite, v.alvo]);

/**
 * Mantém no livro da corretora a proteção certa para a posição de agora. Guarda só o
 * que evita repetir: o último aviso dado e a última recusa (não insiste a cada minuto).
 */
export class StopNaCorretora {
  private ultimoAviso: string | null = null;
  private recusa: { readonly chave: string; readonly ate: number } | null = null;

  constructor(
    private readonly robo: RoboConfig,
    private readonly deps: Dependencias,
    private readonly efetiva: (posicao: Posicao) => Promise<ProtecaoEfetiva | null>,
  ) {}

  /** Depois de decidir: cria, troca ou tira a proteção conforme a posição e o preço de agora. */
  async ajustar(preco: Valor): Promise<void> {
    const porta = this.deps.protecoes;
    if (!porta) return;
    const posicao = posicaoDe(await this.deps.ordens.execucoes(this.robo.id));
    const viva = await porta.viva(this.robo.id);
    if (posicao.quantidade.isZero()) {
      // Proteção sem posição venderia o que o robô não tem.
      if (viva) await liberarProtecao(this.deps, this.robo);
      return;
    }
    if (viva?.estado === "PENDENTE") return; // a conferência do próximo candle resolve
    const desejada = await this.desejada(posicao, preco, viva);
    if (!desejada || (viva && chaveDaViva(viva) === chaveDe(desejada))) return;
    if (viva && (await liberarProtecao(this.deps, this.robo)) === "presa") return;
    if (viva) {
      // A troca pode ter revelado uma execução: a posição mudou, recalcula no próximo candle.
      const agora = posicaoDe(await this.deps.ordens.execucoes(this.robo.id));
      if (!agora.quantidade.equals(posicao.quantidade)) return;
    }
    await this.colocar(porta, desejada);
  }

  private async desejada(
    posicao: Posicao,
    preco: Valor,
    viva: ProtecaoGravada | null,
  ): Promise<Desejada | null> {
    const efetiva = await this.efetiva(posicao);
    if (!efetiva) {
      await this.avisar(
        "sem_compra",
        "Posição aberta sem a compra que a abriu no diário: sem proteção na corretora; o robô segue vigiando o stop.",
      );
      return null;
    }
    const f = await this.deps.corretora.filtros(this.robo.simbolo);
    const stop = arredondarParaCima(efetiva.stop, f.passoPreco);
    // Stop no preço ou acima: a corretora recusaria (dispararia na hora); o robô vende agora.
    if (stop.gte(preco)) return null;
    const limite = arredondarParaBaixo(
      stop.times(dec(1).minus(dec(this.deps.opcoes.stopLimiteBps).div(10_000))),
      f.passoPreco,
    );
    const quantidade = await this.quantidade(posicao, f, viva);
    if (quantidade.lt(f.quantidadeMinima) || quantidade.times(limite).lt(f.valorMinimo)) {
      await this.avisar(
        "poeira",
        `A posição (${paraTexto(posicao.quantidade)}) vale menos que o mínimo da corretora para uma ordem: é poeira, não dá para deixar stop no livro nem vendê-la.`,
      );
      return null;
    }
    const alvo = arredondarParaCima(efetiva.alvo, f.passoPreco);
    return { ...efetiva, stop, limite, quantidade, ...(alvo.gt(preco) ? { alvoNoLivro: alvo } : {}) };
  }

  /** A posição no passo da corretora, sem passar do que a conta tem livre (mais o que a proteção viva trava). */
  private async quantidade(posicao: Posicao, f: FiltrosAtivo, viva: ProtecaoGravada | null): Promise<Valor> {
    const base = ativosDoSimbolo(this.robo.simbolo).base;
    const livre = (await this.deps.corretora.saldoLivre(base)).plus(viva?.quantidade ?? 0);
    const desejada = arredondarParaBaixo(posicao.quantidade, f.passoQuantidade);
    if (livre.gte(desejada)) return desejada;
    await this.avisar(
      "saldo",
      `A conta tem ${paraTexto(livre)} ${base} livre, menos que a posição do robô (${paraTexto(posicao.quantidade)}): a proteção cobre só o que há. Algo vendeu ou travou parte da base fora do robô.`,
    );
    return arredondarParaBaixo(livre, f.passoQuantidade);
  }

  private async colocar(porta: PortaProtecoes, d: Desejada): Promise<void> {
    const chaveDesejada = chaveDe(d);
    if (this.recusa?.chave === chaveDesejada && this.deps.relogio.agora() < this.recusa.ate) return;
    const ids = idsProtecaoDe(randomUUID(), d.alvoNoLivro !== undefined);
    const nova = {
      roboId: this.robo.id,
      decisaoId: d.decisaoId,
      simbolo: this.robo.simbolo,
      ids,
      quantidade: d.quantidade,
      stop: d.stop,
      limite: d.limite,
      ...(d.alvoNoLivro ? { alvo: d.alvoNoLivro } : {}),
    };
    if ((await porta.reservar(nova)) === "ja_existe") return;
    let r: ResultadoProtecao;
    try {
      r = await this.deps.corretora.colocarProtecao({ ...nova, ids });
    } catch (erro) {
      // Estado incerto: fica PENDENTE e a conferência do próximo candle descobre se entrou.
      this.deps.registro.error(
        { erro, roboId: this.robo.id, lista: ids.lista },
        "falha ao colocar a proteção",
      );
      return;
    }
    const agora = this.deps.relogio.agora();
    await aplicarProtecao(
      this.deps,
      this.robo,
      { ...nova, estado: "PENDENTE", idCorretora: null, criadaEm: agora, atualizadaEm: agora },
      r,
    );
    if (r.estado === "REJEITADA") {
      this.recusa = { chave: chaveDesejada, ate: agora + RECUSA_ESPERA_MS };
      await this.publicarRisco(
        "protecao_recusada",
        `A corretora recusou o stop da posição: ${r.motivo ?? "sem motivo"} O robô segue vigiando o stop e tenta de novo em alguns minutos.`,
      );
      return;
    }
    this.recusa = null;
    this.ultimoAviso = null;
    this.deps.registro.info(
      {
        roboId: this.robo.id,
        lista: ids.lista,
        stop: paraTexto(d.stop),
        alvo: d.alvoNoLivro && paraTexto(d.alvoNoLivro),
      },
      "proteção colocada na corretora",
    );
  }

  /** Avisa uma vez por problema (não a cada minuto): registro e evento de risco para a tela. */
  private async avisar(codigo: string, mensagem: string): Promise<void> {
    if (this.ultimoAviso === codigo) return;
    this.ultimoAviso = codigo;
    this.deps.registro.warn({ roboId: this.robo.id, codigo }, mensagem);
    await this.publicarRisco(codigo, mensagem);
  }

  private publicarRisco(codigo: string, mensagem: string): Promise<void> {
    return publicar(this.deps, {
      tipo: "risco",
      roboId: this.robo.id,
      barreira: { codigo, mensagem },
      em: this.deps.relogio.agora(),
    });
  }
}
