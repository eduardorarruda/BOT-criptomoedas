import { ImportacaoB3Esquema, type ImportacaoB3DTO } from "@zentrade/contratos/esquemas";
import { z } from "zod";
import { CABECALHO_CSRF, criarCliente, lerCookieCsrf, type ClienteApi } from "../../api/cliente";
import { ERRO_RESPOSTA_INVALIDA, ERRO_SEM_CONEXAO, erroPorStatus, ErroApi } from "../../api/erros";
import { ErroRespostaEsquema } from "../../api/esquemas";

/** Só a extensão aqui; o conteúdo (assinatura do .zip) é conferido de novo pela API. */
export const LIMITE_ZIP_B3_BYTES = 150 * 1024 * 1024;

export interface ApiImportacaoB3 {
  /** Importações recentes, mais nova primeiro (para a tela mostrar o estado). */
  listar(): Promise<ImportacaoB3DTO[]>;
  /** Para acompanhar depois do envio: o motor processa em segundo plano (fila). */
  obter(id: string): Promise<ImportacaoB3DTO>;
  /** Pede ao motor para buscar o que falta do WIN no MetaTrader 5 (acompanhe com `obter`). */
  atualizarMt5(): Promise<ImportacaoB3DTO>;
  /** Envia o .zip cru; `aoProgresso` recebe de 0 a 1 enquanto os bytes sobem. */
  enviar(arquivo: File, aoProgresso: (fracao: number) => void): Promise<ImportacaoB3DTO>;
}

export function conferirZipB3(arquivo: Pick<File, "name" | "size">): string | null {
  if (!arquivo.name.toLowerCase().endsWith(".zip"))
    return "Envie o .zip baixado no BDI (não descompacte antes de enviar).";
  if (arquivo.size === 0) return "O arquivo está vazio.";
  if (arquivo.size > LIMITE_ZIP_B3_BYTES) return "O arquivo passa de 150 MB: não parece o .zip da B3.";
  return null;
}

function respostaDoEnvio(xhr: XMLHttpRequest): ImportacaoB3DTO {
  const corpo: unknown = JSON.parse(xhr.responseText || "null");
  if (xhr.status >= 200 && xhr.status < 300) {
    const lido = ImportacaoB3Esquema.safeParse(corpo);
    if (!lido.success) throw ERRO_RESPOSTA_INVALIDA("/dados-b3/importacoes");
    return lido.data;
  }
  const erro = ErroRespostaEsquema.safeParse(corpo);
  throw erro.success
    ? new ErroApi(erro.data.erro.codigo, erro.data.erro.mensagem, xhr.status)
    : erroPorStatus(xhr.status);
}

/** XMLHttpRequest porque o fetch não informa o progresso do envio (o .zip pode ter ~60 MB). */
export function enviarZipComProgresso(
  url: string,
  corpo: Blob,
  csrf: string | null,
  aoProgresso: (fracao: number) => void,
  criarXhr: () => XMLHttpRequest = () => new XMLHttpRequest(),
): Promise<ImportacaoB3DTO> {
  return new Promise((ok, falhar) => {
    const xhr = criarXhr();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    if (csrf) xhr.setRequestHeader(CABECALHO_CSRF, csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) aoProgresso(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        ok(respostaDoEnvio(xhr));
      } catch (e) {
        falhar(e instanceof ErroApi ? e : erroPorStatus(xhr.status));
      }
    };
    xhr.onerror = () => falhar(ERRO_SEM_CONEXAO());
    xhr.send(corpo);
  });
}

export function criarApiImportacaoB3(
  cliente: ClienteApi = criarCliente(),
  criarXhr?: () => XMLHttpRequest,
  lerCsrf: () => string | null = () => lerCookieCsrf(),
): ApiImportacaoB3 {
  const { pedir } = cliente;
  return {
    listar: () => pedir("GET", "/dados-b3/importacoes", z.array(ImportacaoB3Esquema)),
    atualizarMt5: () => pedir("POST", "/dados-mt5/atualizar", ImportacaoB3Esquema),
    obter: (id) => pedir("GET", `/dados-b3/importacoes/${encodeURIComponent(id)}`, ImportacaoB3Esquema),
    enviar: (arquivo, aoProgresso) => {
      const consulta = new URLSearchParams({ nome: arquivo.name });
      return enviarZipComProgresso(
        `/api/v1/dados-b3/importacoes?${consulta}`,
        arquivo,
        lerCsrf(),
        aoProgresso,
        criarXhr,
      );
    },
  };
}

const INTERVALO_CONSULTA_MS = 2000;
const TENTATIVAS_MAXIMAS = 150; // 5 minutos

/**
 * Acompanha uma importação (upload da B3 ou atualização pelo MT5) até o motor terminar:
 * `aoMudar` recebe cada estado intermediário; devolve o estado final (concluída ou falhou),
 * ou uma falha sintética se o motor não responder em 5 minutos.
 */
export async function acompanharImportacao(
  api: Pick<ApiImportacaoB3, "obter">,
  id: string,
  aoMudar: (atual: ImportacaoB3DTO) => void,
  intervaloMs = INTERVALO_CONSULTA_MS,
): Promise<Pick<ImportacaoB3DTO, "estado" | "resumo" | "erro">> {
  for (let tentativa = 0; tentativa < TENTATIVAS_MAXIMAS; tentativa++) {
    await new Promise((r) => setTimeout(r, intervaloMs));
    const atual = await api.obter(id).catch(() => null);
    if (!atual) continue;
    if (atual.estado === "concluida" || atual.estado === "falhou") return atual;
    aoMudar(atual);
  }
  return { estado: "falhou", resumo: null, erro: "demorou demais para o motor responder; confira depois" };
}
