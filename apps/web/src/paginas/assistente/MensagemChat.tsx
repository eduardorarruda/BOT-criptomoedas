import type { FerramentaUsada, FonteCitada, MensagemAssistente } from "@zentrade/contratos/esquemas";
import { BookOpen, CircleAlert, ExternalLink, PauseCircle, Wrench } from "lucide-react";
import { m } from "motion/react";
import { Enso } from "../../componentes/Enso";
import { linkSeguro } from "../../lib/link";
import { FONTE_DOCUMENTO } from "../../lib/rotulos";
import { formatarHora } from "../../lib/tempo";
import { Markdown } from "./Markdown";

const NOME_PROVEDOR = { api: "Claude pela API", cli: "Claude Code" } as const;

export function Ferramentas({ lista }: { readonly lista: readonly FerramentaUsada[] }) {
  if (lista.length === 0) return null;
  return (
    <ol className="chat__ferramentas" aria-label="O que o assistente consultou">
      {lista.map((f, i) => (
        <m.li
          key={`${f.nome}-${i}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Wrench size={12} aria-hidden="true" />
          {f.descricao}
        </m.li>
      ))}
    </ol>
  );
}

export function Fontes({ lista }: { readonly lista: readonly FonteCitada[] }) {
  if (lista.length === 0) return null;
  return (
    <details className="chat__fontes">
      <summary>
        <BookOpen size={13} aria-hidden="true" /> {lista.length} fonte{lista.length > 1 ? "s" : ""} consultada
        {lista.length > 1 ? "s" : ""}
      </summary>
      <ul role="list">
        {lista.map((f) => {
          const url = linkSeguro(f.url ?? null);
          return (
            <li key={f.id}>
              <span className="chat__fonte-tipo">{FONTE_DOCUMENTO[f.tipo]}</span>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer nofollow">
                  {f.titulo} <ExternalLink size={12} aria-label="(abre em outra aba)" />
                </a>
              ) : (
                <span>{f.titulo}</span>
              )}
              {f.data ? <span className="apagado"> · {f.data}</span> : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Rodape({ msg }: { readonly msg: MensagemAssistente }) {
  const quem = msg.provedor ? NOME_PROVEDOR[msg.provedor] : null;
  return (
    <p className="chat__rodape apagado">
      {formatarHora(msg.criadaEm)}
      {quem ? ` · ${quem}` : ""}
      {msg.modelo ? ` · ${msg.modelo}` : ""}
    </p>
  );
}

/** Uma mensagem já gravada: a pergunta da pessoa ou a resposta, com o que foi consultado. */
export function MensagemChat({ msg }: { readonly msg: MensagemAssistente }) {
  if (msg.papel === "usuario") {
    return (
      <li className="chat__msg chat__msg--pessoa">
        <p className="chat__balao">{msg.texto}</p>
      </li>
    );
  }
  return (
    <li className="chat__msg chat__msg--assistente">
      <Enso tamanho={22} className="chat__avatar" />
      <div className="chat__corpo">
        <Ferramentas lista={msg.ferramentas} />
        {msg.texto ? <Markdown texto={msg.texto} /> : null}
        {msg.situacao !== "ok" ? (
          <p className={`chat__aviso chat__aviso--${msg.situacao}`} role="status">
            {msg.situacao === "interrompida" ? (
              <PauseCircle size={14} aria-hidden="true" />
            ) : (
              <CircleAlert size={14} aria-hidden="true" />
            )}
            {msg.erro ?? (msg.situacao === "interrompida" ? "Resposta interrompida." : "A resposta falhou.")}
          </p>
        ) : null}
        <Fontes lista={msg.fontes} />
        <Rodape msg={msg} />
      </div>
    </li>
  );
}
