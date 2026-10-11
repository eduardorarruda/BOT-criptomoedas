import {
  DetalheImobiliarioEsquema,
  LancamentoImobiliarioEsquema,
  VisaoImobiliarioEsquema,
  type DetalheImobiliario,
  type LancamentoImobiliario,
  type MudancaInvestimentoImobiliario,
  type NovoInvestimentoImobiliario,
  type NovoLancamentoImobiliario,
  type VisaoImobiliario,
} from "@zentrade/contratos/esquemas";
import { criarCliente, type ClienteApi } from "../../api/cliente";

/**
 * De onde a tela do imobiliário tira os dados: a API (`/api/v1/imobiliario`) ou, no
 * modo de demonstração, uma carteira de exemplo calculada no navegador.
 */
export interface ConsultaImobiliario {
  readonly dataBase?: string;
  readonly cdiAnual?: number | null;
}

export interface FonteImobiliario {
  visao(c: ConsultaImobiliario): Promise<VisaoImobiliario>;
  detalhe(id: string, c: ConsultaImobiliario): Promise<DetalheImobiliario>;
  criar(novo: NovoInvestimentoImobiliario): Promise<DetalheImobiliario>;
  atualizar(id: string, mudanca: MudancaInvestimentoImobiliario): Promise<DetalheImobiliario>;
  remover(id: string): Promise<void>;
  adicionarLancamento(id: string, l: NovoLancamentoImobiliario): Promise<LancamentoImobiliario>;
  removerLancamento(id: string, lancamentoId: string): Promise<void>;
}

const consulta = (c: ConsultaImobiliario) => ({
  dataBase: c.dataBase,
  cdiAnual: c.cdiAnual ?? undefined,
});

const BASE = "/imobiliario/investimentos";

export function criarFonteImobiliarioApi(cliente: ClienteApi = criarCliente()): FonteImobiliario {
  const { pedir } = cliente;
  const id = (v: string) => encodeURIComponent(v);
  return {
    visao: (c) => pedir("GET", "/imobiliario", VisaoImobiliarioEsquema, undefined, consulta(c)),
    detalhe: (i, c) => pedir("GET", `${BASE}/${id(i)}`, DetalheImobiliarioEsquema, undefined, consulta(c)),
    criar: (novo) => pedir("POST", BASE, DetalheImobiliarioEsquema, novo),
    atualizar: (i, m) => pedir("PATCH", `${BASE}/${id(i)}`, DetalheImobiliarioEsquema, m),
    remover: async (i) => {
      await pedir("DELETE", `${BASE}/${id(i)}`, null);
    },
    adicionarLancamento: (i, l) =>
      pedir("POST", `${BASE}/${id(i)}/lancamentos`, LancamentoImobiliarioEsquema, l),
    removerLancamento: async (i, lancamentoId) => {
      await pedir("DELETE", `${BASE}/${id(i)}/lancamentos/${id(lancamentoId)}`, null);
    },
  };
}
