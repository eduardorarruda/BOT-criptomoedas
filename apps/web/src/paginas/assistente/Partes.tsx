import type { FerramentaUsada, FonteCitada } from "@zentrade/contratos/esquemas";
import {
  BookOpen,
  Check,
  ChevronDown,
  CircleCheck,
  CircleSlash,
  Copy,
  ExternalLink,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { useId, useState } from "react";
import { linkSeguro } from "../../lib/link";
import { FONTE_DOCUMENTO } from "../../lib/rotulos";
import { formatarDataHora, formatarHora } from "../../lib/tempo";
import type { EstadoEtapa } from "./estado";
import { useCopiar } from "./useCopiar";

/**
 * Peças de uma resposta: as consultas que o assistente fez (recolhidas numa linha, como
 * os blocos de ferramenta do Claude), as fontes em fichas e a barra de ações.
 */
const ICONE_ETAPA = {
  rodando: <LoaderCircle size={14} className="girar" aria-hidden="true" />,
  feita: <CircleCheck size={14} aria-hidden="true" />,
  parada: <CircleSlash size={14} aria-hidden="true" />,
} as const;

const SITUACAO_ETAPA = { rodando: "em andamento", feita: "concluída", parada: "não terminou" } as const;

export function Etapas({
  etapas,
  estadoDe,
}: {
  readonly etapas: readonly FerramentaUsada[];
  readonly estadoDe: (i: number) => EstadoEtapa;
}) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  if (etapas.length === 0) return null;
  const estados = etapas.map((_, i) => estadoDe(i));
  const iRodando = estados.indexOf("rodando");
  const geral: EstadoEtapa = iRodando >= 0 ? "rodando" : estados.includes("parada") ? "parada" : "feita";
  const resumo =
    iRodando >= 0
      ? `${etapas[iRodando]?.descricao ?? ""}…`
      : etapas.length === 1
        ? (etapas[0]?.descricao ?? "")
        : `${etapas.length} consultas aos seus dados`;
  return (
    <div className={`etapas etapas--${geral}`}>
      <button
        type="button"
        className="etapas__resumo"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto(!aberto)}
      >
        {ICONE_ETAPA[geral]}
        <span className="etapas__texto">{resumo}</span>
        <span className="so-leitor"> ({SITUACAO_ETAPA[geral]})</span>
        <ChevronDown size={14} className="etapas__seta" aria-hidden="true" />
      </button>
      <ol id={id} className="etapas__lista" hidden={!aberto}>
        {etapas.map((e, i) => (
          <li key={`${e.nome}-${i}`} className={`etapas__item etapas__item--${estados[i] ?? "feita"}`}>
            {ICONE_ETAPA[estados[i] ?? "feita"]}
            <span>{e.descricao}</span>
            <code className="etapas__nome">{e.nome}</code>
            <span className="so-leitor"> ({SITUACAO_ETAPA[estados[i] ?? "feita"]})</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Fontes({ lista }: { readonly lista: readonly FonteCitada[] }) {
  if (lista.length === 0) return null;
  return (
    <div className="fontes">
      <p className="fontes__titulo">
        <BookOpen size={13} aria-hidden="true" /> {lista.length === 1 ? "1 fonte" : `${lista.length} fontes`}
      </p>
      <ul className="fontes__lista" aria-label="Fontes consultadas">
        {lista.map((f) => {
          const url = linkSeguro(f.url ?? null);
          const conteudo = (
            <>
              <span className="fonte__tipo">{FONTE_DOCUMENTO[f.tipo]}</span>
              <span className="fonte__titulo">{f.titulo}</span>
              {f.data ? <span className="fonte__data">{f.data}</span> : null}
            </>
          );
          return (
            <li key={f.id}>
              {url ? (
                <a className="fonte" href={url} target="_blank" rel="noopener noreferrer nofollow">
                  {conteudo}
                  <ExternalLink size={12} aria-label="(abre em outra aba)" />
                </a>
              ) : (
                <span className="fonte">{conteudo}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Copiar, gerar de novo (só na última resposta) e a hora. */
export function Acoes({
  texto,
  criadaEm,
  detalhe,
  rotuloCopiar,
  aoRegenerar,
}: {
  readonly texto: string;
  readonly criadaEm: number;
  readonly detalhe?: string | undefined;
  readonly rotuloCopiar: string;
  readonly aoRegenerar?: (() => void) | undefined;
}) {
  const [estado, copiar] = useCopiar();
  return (
    <div className="acoes">
      {texto ? (
        <button
          type="button"
          className="acoes__botao"
          onClick={() => void copiar(texto)}
          aria-label={
            estado === "copiado" ? "Copiado" : estado === "falhou" ? "Não deu para copiar" : rotuloCopiar
          }
          title={rotuloCopiar}
        >
          {estado === "copiado" ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
        </button>
      ) : null}
      {aoRegenerar ? (
        <button
          type="button"
          className="acoes__botao"
          onClick={aoRegenerar}
          aria-label="Gerar a resposta de novo"
          title="Gerar de novo"
        >
          <RotateCcw size={14} aria-hidden="true" />
        </button>
      ) : null}
      <time
        className="acoes__hora"
        dateTime={new Date(criadaEm).toISOString()}
        title={formatarDataHora(criadaEm)}
      >
        {formatarHora(criadaEm)}
        {detalhe ? ` · ${detalhe}` : ""}
      </time>
    </div>
  );
}
