import type { FonteDocumento, OrigemDocumento } from "@zentrade/contratos/esquemas";
import { CampoSelecao } from "../../componentes/Campo";
import { FONTE_DOCUMENTO } from "../../lib/rotulos";

export const CHAVE_DOCUMENTOS = ["conhecimento", "documentos-detalhados"] as const;
export const chaveDetalhe = (id: string) => ["conhecimento", "detalhe", id] as const;

/** Fontes que a pessoa pode escolher ao enviar (o diário é escrito pelo motor). */
const ESCOLHIVEIS: readonly FonteDocumento[] = ["nota", "estrategia", "regra_corretora", "noticia"];

export const ORIGEM: Record<OrigemDocumento, string> = {
  texto: "Texto",
  arquivo: "Arquivo",
  link: "Link",
  automacao: "Automação",
};

export function EscolhaFonte({
  valor,
  aoMudar,
}: {
  readonly valor: FonteDocumento;
  readonly aoMudar: (f: FonteDocumento) => void;
}) {
  return (
    <CampoSelecao
      rotulo="Tipo de conteúdo"
      value={valor}
      onChange={(e) => aoMudar(e.target.value as FonteDocumento)}
      dica="Ajuda o agente a pesar o conteúdo: regra da corretora e estratégia quase não envelhecem; notícia envelhece rápido."
    >
      {ESCOLHIVEIS.map((f) => (
        <option key={f} value={f}>
          {FONTE_DOCUMENTO[f]}
        </option>
      ))}
    </CampoSelecao>
  );
}

export function formatarBytes(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
