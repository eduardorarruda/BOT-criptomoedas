import { useReducer } from "react";
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

/** "Ocultar" vale por pessoa, neste navegador. A paleta de comandos traz de volta. */
const chaveOculto = (usuarioId: string): string => `zentrade:comece-aqui:oculto:${usuarioId}`;

export function lerComeceAquiOculto(usuarioId: string): boolean {
  try {
    return localStorage.getItem(chaveOculto(usuarioId)) === "1";
  } catch {
    return false;
  }
}

export function definirComeceAquiOculto(usuarioId: string, oculto: boolean): void {
  try {
    if (oculto) localStorage.setItem(chaveOculto(usuarioId), "1");
    else localStorage.removeItem(chaveOculto(usuarioId));
  } catch {
    // sem armazenamento: vale até recarregar a tela
  }
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
  const [, redesenhar] = useReducer((n: number) => n + 1, 0);

  // No exemplo cheio ninguém opera a instância: o passo do controlador não se aplica.
  const operadorSeAplica = !fonte.demo || fonte.vazio === true;
  const esperandoConfig = operadorSeAplica && config.isPending;
  const resultado = esperandoConfig
    ? null
    : derivarPassos({
        doisFatores: usuario?.doisFatores,
        contas,
        estrategias,
        backtests,
        robos,
        documentos,
        controlador: operadorSeAplica && config.isSuccess ? config.data.controlador : undefined,
      });

  const id = usuario?.id;
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
