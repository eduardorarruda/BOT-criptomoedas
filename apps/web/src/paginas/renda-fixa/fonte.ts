import {
  ConnectTokenEsquema,
  EstadoPluggyEsquema,
  IndicadoresEsquema,
  RegrasTributariasEsquema,
  ResultadoIsentoEsquema,
  ResultadoPreIpcaEsquema,
  ResultadoSelicCdbPoupancaEsquema,
  ResultadoSincronizacaoEsquema,
  ResumoRendaFixaEsquema,
  TituloDetalheEsquema,
  TituloRendaFixaEsquema,
  type EstadoPluggy,
  type Indicadores,
  type MudancaTitulo,
  type NovoTitulo,
  type RegrasTributariasDTO,
  type ResultadoIsento,
  type ResultadoPreIpca,
  type ResultadoSelicCdbPoupanca,
  type ResultadoSincronizacao,
  type ResumoRendaFixa,
  type SimularIsento,
  type SimularPreIpca,
  type SimularSelicCdbPoupanca,
  type TituloDetalhe,
  type TituloRendaFixa,
} from "@zentrade/contratos/esquemas";
import { z } from "zod";
import { criarCliente, type ClienteApi } from "../../api/cliente";

/**
 * De onde a tela de renda fixa tira os dados: a API (`/api/v1/renda-fixa` e
 * `/api/v1/pluggy`) ou a demonstração, que calcula tudo no navegador.
 */
export interface PremissasTela {
  readonly cdi?: string;
  readonly selic?: string;
  readonly ipca?: string;
}

export interface FonteRendaFixa {
  readonly demo: boolean;
  resumo(): Promise<ResumoRendaFixa>;
  titulos(): Promise<TituloRendaFixa[]>;
  titulo(id: string, premissas?: PremissasTela): Promise<TituloDetalhe>;
  criarTitulo(t: NovoTitulo): Promise<TituloRendaFixa>;
  alterarTitulo(id: string, m: MudancaTitulo): Promise<TituloRendaFixa>;
  removerTitulo(id: string): Promise<void>;
  indicadores(): Promise<Indicadores>;
  atualizarIndicadores(): Promise<Indicadores>;
  regras(): Promise<RegrasTributariasDTO>;
  simularIsento(e: SimularIsento): Promise<ResultadoIsento>;
  simularSelicCdbPoupanca(e: SimularSelicCdbPoupanca): Promise<ResultadoSelicCdbPoupanca>;
  simularPreIpca(e: SimularPreIpca): Promise<ResultadoPreIpca>;
  pluggy(): Promise<EstadoPluggy>;
  connectToken(itemId?: string): Promise<string>;
  conectarItem(itemId: string): Promise<ResultadoSincronizacao>;
  sincronizarItem(itemId: string): Promise<ResultadoSincronizacao>;
  removerItem(itemId: string): Promise<void>;
}

export function criarFonteRendaFixaApi(cliente: ClienteApi = criarCliente()): FonteRendaFixa {
  const { pedir } = cliente;
  const id = encodeURIComponent;
  return {
    demo: false,
    resumo: () => pedir("GET", "/renda-fixa/resumo", ResumoRendaFixaEsquema),
    titulos: () => pedir("GET", "/renda-fixa/titulos", z.array(TituloRendaFixaEsquema)),
    titulo: (t, p = {}) =>
      pedir("GET", `/renda-fixa/titulos/${id(t)}`, TituloDetalheEsquema, undefined, { ...p }),
    criarTitulo: (t) => pedir("POST", "/renda-fixa/titulos", TituloRendaFixaEsquema, t),
    alterarTitulo: (t, m) => pedir("PATCH", `/renda-fixa/titulos/${id(t)}`, TituloRendaFixaEsquema, m),
    removerTitulo: (t) => pedir("DELETE", `/renda-fixa/titulos/${id(t)}`, null),
    indicadores: () => pedir("GET", "/renda-fixa/indicadores", IndicadoresEsquema),
    atualizarIndicadores: () => pedir("POST", "/renda-fixa/indicadores/atualizar", IndicadoresEsquema),
    regras: () => pedir("GET", "/renda-fixa/regras", RegrasTributariasEsquema),
    simularIsento: (e) => pedir("POST", "/renda-fixa/simular/isento", ResultadoIsentoEsquema, e),
    simularSelicCdbPoupanca: (e) =>
      pedir("POST", "/renda-fixa/simular/selic-cdb-poupanca", ResultadoSelicCdbPoupancaEsquema, e),
    simularPreIpca: (e) => pedir("POST", "/renda-fixa/simular/pre-ipca", ResultadoPreIpcaEsquema, e),
    pluggy: () => pedir("GET", "/pluggy", EstadoPluggyEsquema),
    connectToken: async (itemId) =>
      (await pedir("POST", "/pluggy/connect-token", ConnectTokenEsquema, itemId ? { itemId } : {}))
        .accessToken,
    conectarItem: (itemId) => pedir("POST", "/pluggy/itens", ResultadoSincronizacaoEsquema, { itemId }),
    sincronizarItem: (itemId) =>
      pedir("POST", `/pluggy/itens/${id(itemId)}/sincronizar`, ResultadoSincronizacaoEsquema, {}),
    removerItem: (itemId) => pedir("DELETE", `/pluggy/itens/${id(itemId)}`, null),
  };
}
