import type { EstadoDecisao, NovaDecisao, RoboConfig } from "@zentrade/contratos";
import { formatarNumero, paraTexto, type Sinal } from "@zentrade/dominio";
import { concorda, consultarAgente } from "./analise.js";
import { registrarDecisao, mudarEstado, type DecisaoRegistrada } from "./diario.js";
import { exposicao, montarEstadoRisco } from "./estado-risco.js";
import { executarDecisao } from "./execucao.js";
import { avaliar, planejar, type Plano } from "./plano.js";
import type { Dependencias, EntradaCiclo, ResultadoCiclo } from "./tipos.js";

export type { EntradaCiclo, ResultadoCiclo } from "./tipos.js";

type SinalOperacao = Extract<Sinal, { acao: "COMPRAR" | "VENDER" }>;

/** Venda por stop: sair reduz risco; não espera agente nem aprovação. */
export const ehStop = (sinal: Sinal): boolean => sinal.acao === "VENDER" && sinal.motivo === "stop";

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
  const analise = ehStop(sinal) ? null : await consultarAgente(deps, robo, e);
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

/** Observar só registra; sugerir pede aprovação (menos no stop); auto executa. */
const estadoInicial = (robo: RoboConfig, sinal: Sinal): EstadoDecisao => {
  if (robo.modo === "observar") return "registrada";
  return robo.modo === "sugerir" && !ehStop(sinal) ? "aguardando_aprovacao" : "aprovada";
};

function montarDecisao(
  deps: Dependencias,
  robo: RoboConfig,
  e: EntradaCiclo,
  plano: Plano,
  risco: NovaDecisao["risco"],
  comAgente: Pick<NovaDecisao, "proposta" | "custoIaUsd">,
): NovaDecisao {
  const estado = !risco.aprovada ? "barrada" : estadoInicial(robo, e.sinal);
  return {
    ...base(robo, e),
    ...comAgente,
    quantidade: plano.quantidade,
    risco,
    estado,
    ...(plano.stop && plano.alvo ? { protecao: { stop: plano.stop, alvo: plano.alvo } } : {}),
    ...(estado === "aguardando_aprovacao"
      ? { expiraEm: deps.relogio.agora() + deps.opcoes.expiracaoAprovacaoMs }
      : {}),
  };
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
  const decisao = montarDecisao(deps, robo, e, plano, risco, comAgente);
  const registrada = await registrarDecisao(deps, decisao);
  if (decisao.estado === "barrada" || decisao.estado === "registrada")
    return { estado: decisao.estado, plano };
  try {
    if (decisao.estado === "aguardando_aprovacao")
      return await pedirAprovacao(deps, robo, e, registrada, plano);
    return await executarDecisao(deps, robo, registrada, plano);
  } catch (erro) {
    await mudarEstado(deps, registrada, "falhou");
    throw erro;
  }
}

/** Pede a aprovação e volta na hora: quem espera a resposta é o robô, fora da trava. */
async function pedirAprovacao(
  deps: Dependencias,
  robo: RoboConfig,
  e: EntradaCiclo,
  registrada: DecisaoRegistrada,
  plano: Plano,
): Promise<ResultadoCiclo> {
  const expiraEm = registrada.decisao.expiraEm ?? deps.relogio.agora() + deps.opcoes.expiracaoAprovacaoMs;
  const resumo = `${plano.lado === "COMPRA" ? "Comprar" : "Vender"} ${paraTexto(plano.quantidade)} ${robo.simbolo} a ~${formatarNumero(e.preco)}: ${e.sinal.explicacao}`;
  await deps.aprovacao.solicitar(registrada.id, resumo, expiraEm);
  return {
    estado: "aguardando_aprovacao",
    plano,
    decisaoId: registrada.id,
    pendente: { registrada, plano, entrada: e, expiraEm },
  };
}
