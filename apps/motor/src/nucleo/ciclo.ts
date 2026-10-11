import type { EstadoDecisao, NovaDecisao, ResultadoOrdem, RoboConfig } from "@zentrade/contratos";
import { formatarNumero, paraTexto, type Posicao, type Sinal, type Valor } from "@zentrade/dominio";
import { concorda, consultarAgente, type PedidoDoCiclo } from "./analise.js";
import { aguardarAprovacao } from "./aprovacao.js";
import { mudarEstado, registrarDecisao, type DecisaoRegistrada } from "./diario.js";
import { montarEstadoRisco } from "./estado-risco.js";
import { executarOrdem } from "./execucao.js";
import { avaliar, planejar, type Plano } from "./plano.js";
import type { Dependencias } from "./tipos.js";

export interface EntradaCiclo extends PedidoDoCiclo {
  readonly em: number;
}

export interface ResultadoCiclo {
  readonly estado: EstadoDecisao | null;
  readonly plano?: Plano;
  readonly ordem?: ResultadoOrdem;
  readonly decisaoId?: string;
}

type SinalOperacao = Extract<Sinal, { acao: "COMPRAR" | "VENDER" }>;

const base = (robo: RoboConfig, e: EntradaCiclo) => ({
  roboId: robo.id,
  em: e.em,
  sinal: e.sinal,
  preco: e.preco,
});

/** O que acontece entre o sinal da regra e a ordem: agente → plano → risco → modo → execução. */
export async function processarSinal(
  deps: Dependencias,
  robo: RoboConfig,
  e: EntradaCiclo,
): Promise<ResultadoCiclo> {
  if (e.sinal.acao === "AGUARDAR") return { estado: null };
  const sinal: SinalOperacao = e.sinal;
  // Venda por stop não espera o agente: sair reduz risco.
  const porStop = sinal.acao === "VENDER" && sinal.motivo === "stop";
  const analise = porStop ? null : await consultarAgente(deps, robo, e);
  if (analise?.tipo === "falhou" && deps.opcoes.agenteObrigatorio) {
    const barreira = {
      codigo: "agente_indisponivel",
      mensagem: `O agente é obrigatório e falhou: ${analise.motivo}`,
    };
    await registrarDecisao(deps, {
      ...base(robo, e),
      risco: { aprovada: false, barreiras: [barreira] },
      estado: "barrada",
    });
    return { estado: "barrada" };
  }
  const resposta = analise?.tipo === "ok" ? analise.resposta : undefined;
  const comAgente = resposta ? { proposta: resposta.proposta, custoIaUsd: resposta.custoUsd } : {};
  if (resposta && !concorda(resposta.proposta, sinal)) {
    const barreira = {
      codigo: "agente_aguardar",
      mensagem: `O agente propôs "${resposta.proposta.acao}": ${resposta.proposta.justificativa}`,
    };
    await registrarDecisao(deps, {
      ...base(robo, e),
      ...comAgente,
      risco: { aprovada: false, barreiras: [barreira] },
      estado: "registrada",
    });
    return { estado: "registrada" };
  }
  return planejarEDecidir(deps, robo, e, sinal, comAgente);
}

async function planejarEDecidir(
  deps: Dependencias,
  robo: RoboConfig,
  e: EntradaCiclo,
  sinal: SinalOperacao,
  comAgente: Pick<NovaDecisao, "proposta" | "custoIaUsd">,
): Promise<ResultadoCiclo> {
  const filtros = await deps.corretora.filtros(robo.simbolo);
  const estado = await montarEstadoRisco(deps, robo.id, exposicao(e.posicao, e.preco));
  const plano = await planejar(deps, robo, sinal, {
    preco: e.preco,
    posicao: e.posicao,
    filtros,
    estado,
    proposta: comAgente.proposta,
  });
  const risco = avaliar(robo, plano, e.preco, estado, filtros);
  const decisao: NovaDecisao = {
    ...base(robo, e),
    ...comAgente,
    quantidade: plano.quantidade,
    risco,
    estado: !risco.aprovada ? "barrada" : estadoInicial(robo),
  };
  const registrada = await registrarDecisao(deps, decisao);
  if (!risco.aprovada || robo.modo === "observar") return { estado: decisao.estado, plano };
  try {
    return await conduzir(deps, robo, e, registrada, plano);
  } catch (erro) {
    await mudarEstado(deps, registrada, "falhou");
    throw erro;
  }
}

const exposicao = (p: Posicao, preco: Valor): Valor => p.quantidade.times(preco);

const estadoInicial = (robo: RoboConfig): EstadoDecisao =>
  robo.modo === "observar" ? "registrada" : robo.modo === "sugerir" ? "aguardando_aprovacao" : "aprovada";

async function conduzir(
  deps: Dependencias,
  robo: RoboConfig,
  e: EntradaCiclo,
  registrada: DecisaoRegistrada,
  plano: Plano,
): Promise<ResultadoCiclo> {
  if (robo.modo === "sugerir") {
    const liberada = await pedirAprovacao(deps, robo, e, registrada, plano);
    if (!liberada) return { estado: (await deps.decisoes.estado(registrada.id)) ?? "expirada", plano };
  }
  return executar(deps, robo, registrada, plano);
}

/** Pede aprovação; depois de aprovada, o risco é reavaliado com o estado de agora (pode ter havido parada total). */
async function pedirAprovacao(
  deps: Dependencias,
  robo: RoboConfig,
  e: EntradaCiclo,
  registrada: DecisaoRegistrada,
  plano: Plano,
): Promise<boolean> {
  const expiraEm = deps.relogio.agora() + deps.opcoes.expiracaoAprovacaoMs;
  const resumo = `${plano.lado === "COMPRA" ? "Comprar" : "Vender"} ${paraTexto(plano.quantidade)} ${robo.simbolo} a ~${formatarNumero(e.preco)}: ${e.sinal.explicacao}`;
  await deps.aprovacao.solicitar(registrada.id, resumo, expiraEm);
  const fim = await aguardarAprovacao(deps, registrada.id, expiraEm);
  if (fim === "expirada") await mudarEstado(deps, registrada, "expirada");
  if (fim !== "aprovada") return false;
  const filtros = await deps.corretora.filtros(robo.simbolo);
  const estado = await montarEstadoRisco(deps, robo.id, exposicao(e.posicao, e.preco));
  const risco = avaliar(robo, plano, e.preco, estado, filtros);
  if (risco.aprovada) return true;
  await mudarEstado(deps, registrada, "barrada", { risco });
  return false;
}

async function executar(
  deps: Dependencias,
  robo: RoboConfig,
  registrada: DecisaoRegistrada,
  plano: Plano,
): Promise<ResultadoCiclo> {
  const ordem = await executarOrdem(deps, robo, registrada.id, plano.lado, plano.quantidade);
  if (!ordem) return { estado: registrada.decisao.estado, plano };
  const estado: EstadoDecisao = ordem.execucoes.length > 0 ? "executada" : "falhou";
  await mudarEstado(deps, registrada, estado, { ordemId: ordem.idCliente });
  return { estado, plano, ordem, decisaoId: registrada.id };
}
