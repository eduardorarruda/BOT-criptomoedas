import { useEffect, useReducer } from "react";
import { useFonte } from "../../api/contexto";
import {
  useBacktests,
  useConfigPublica,
  useContas,
  useDocumentos,
  useEstrategias,
  useRobos,
  useSessao,
} from "../../ganchos/consultas";
import { derivarPassos, type ResultadoPassos } from "../../lib/primeirosPassos";
import { useApiAssistente, useEstadoAssistente, useTokenClaude } from "../assistente/useApiAssistente";

/** "Ocultar" vale por pessoa, neste navegador. A paleta de comandos traz de volta. */
/** A paleta avisa por este evento quando traz os primeiros passos de volta. */
export const EVENTO_COMECE_AQUI = "zentrade:comece-aqui";

/**
 * Duas marcas por pessoa, neste navegador: "oculto" (a pessoa escondeu) e "concluído"
 * (chegou a 6 de 6 uma vez). Feito fica feito: pausar o robô em papel depois não
 * reabre a lista. A paleta ("Mostrar os primeiros passos") apaga as duas.
 */
type Marca = "oculto" | "concluido";
const chave = (marca: Marca, usuarioId: string): string => `zentrade:comece-aqui:${marca}:${usuarioId}`;

function ler(marca: Marca, usuarioId: string): boolean {
  try {
    return localStorage.getItem(chave(marca, usuarioId)) === "1";
  } catch {
    return false;
  }
}

function gravar(marca: Marca, usuarioId: string, ligada: boolean): void {
  try {
    if (ligada) localStorage.setItem(chave(marca, usuarioId), "1");
    else localStorage.removeItem(chave(marca, usuarioId));
  } catch {
    // sem armazenamento: vale até recarregar a tela
  }
}

export const lerComeceAquiOculto = (usuarioId: string): boolean =>
  ler("oculto", usuarioId) || ler("concluido", usuarioId);

export function definirComeceAquiOculto(usuarioId: string, oculto: boolean): void {
  gravar("oculto", usuarioId, oculto);
  if (!oculto) gravar("concluido", usuarioId, false);
}

/**
 * A IA está pronta para esta pessoa: ela conectou o Claude dela. Num servidor que não usa
 * o Claude de cada pessoa, vale a API da Anthropic do servidor (se ela a escolheu). Sem
 * conseguir ler (agente ou API fora), conta como não feito: o passo aparece e a tela de
 * configurações explica o que falta.
 */
function useIaConectada(): boolean | undefined {
  const api = useApiAssistente();
  const token = useTokenClaude(api);
  const estado = useEstadoAssistente(api);
  if (token.isError) return false;
  if (!token.data || estado.isPending) return undefined;
  const e = estado.data;
  const soApi = e !== undefined && !e.tokenClaude?.usar && e.provedores.api && e.config.provedor === "api";
  return token.data.configurado || soApi;
}

export interface ComeceAqui {
  /** `null` enquanto os dados chegam. */
  readonly resultado: ResultadoPassos | null;
  readonly oculto: boolean;
  readonly ocultar: () => void;
  readonly mostrar: () => void;
}

export function useComeceAqui(): ComeceAqui {
  const fonte = useFonte();
  const usuario = useSessao().data;
  const contas = useContas().data;
  const estrategias = useEstrategias().data;
  const backtests = useBacktests().data;
  const robos = useRobos().data;
  const documentos = useDocumentos().data;
  const config = useConfigPublica();
  const ia = useIaConectada();
  const [, redesenhar] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener(EVENTO_COMECE_AQUI, redesenhar);
    return () => window.removeEventListener(EVENTO_COMECE_AQUI, redesenhar);
  }, []);

  // No exemplo cheio ninguém opera a instância: o passo do controlador não se aplica.
  const operadorSeAplica = !fonte.demo || fonte.vazio === true;
  const esperandoConfig = operadorSeAplica && config.isPending;
  const resultado = esperandoConfig
    ? null
    : derivarPassos({
        doisFatores: usuario?.doisFatores,
        ia,
        contas,
        estrategias,
        backtests,
        robos,
        documentos,
        controlador: operadorSeAplica && config.isSuccess ? config.data.controlador : undefined,
      });

  const id = usuario?.id;
  const completo = resultado?.completo === true;
  useEffect(() => {
    if (id && completo) gravar("concluido", id, true);
  }, [id, completo]);
  return {
    resultado,
    oculto: id ? lerComeceAquiOculto(id) : false,
    ocultar: () => {
      if (id) definirComeceAquiOculto(id, true);
      redesenhar();
    },
    mostrar: () => {
      if (id) definirComeceAquiOculto(id, false);
      redesenhar();
    },
  };
}
