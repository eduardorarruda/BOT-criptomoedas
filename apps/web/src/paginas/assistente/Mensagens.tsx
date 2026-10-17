import type { MensagemAssistente } from "@zentrade/contratos/esquemas";
import { CircleAlert, PauseCircle, RotateCcw } from "lucide-react";
import { m } from "motion/react";
import { useState, type ReactNode } from "react";
import { Botao } from "../../componentes/Botao";
import { Enso } from "../../componentes/Enso";
import { emAndamento, estadoDaEtapa, textoParaMostrar, type RespostaAoVivo } from "./estado";
import { Markdown } from "./Markdown";
import { Acoes, Etapas, Fontes } from "./Partes";

const NOME_PROVEDOR = { api: "Claude pela API", cli: "Claude Code" } as const;
const ENTRADA = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: [0.2, 0.7, 0.2, 1] },
} as const;
const SEMPRE_FEITA = () => "feita" as const;

function Item({
  animar,
  className,
  children,
}: {
  readonly animar: boolean;
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    <m.li className={className} {...(animar ? ENTRADA : { initial: false })}>
      {children}
    </m.li>
  );
}

function Pergunta({
  texto,
  criadaEm,
  animar,
}: {
  readonly texto: string;
  readonly criadaEm: number;
  readonly animar: boolean;
}) {
  return (
    <Item animar={animar} className="msg msg--pessoa">
      <div className="msg__balao">{texto}</div>
      <Acoes texto={texto} criadaEm={criadaEm} rotuloCopiar="Copiar a pergunta" />
    </Item>
  );
}

function AvisoGravado({
  msg,
  aoTentar,
}: {
  readonly msg: MensagemAssistente;
  readonly aoTentar?: (() => void) | undefined;
}) {
  if (msg.situacao === "ok") return null;
  const interrompida = msg.situacao === "interrompida";
  return (
    <div className={`msg__aviso msg__aviso--${msg.situacao}`}>
      {interrompida ? (
        <PauseCircle size={16} aria-hidden="true" />
      ) : (
        <CircleAlert size={16} aria-hidden="true" />
      )}
      <span>{interrompida ? "Resposta interrompida." : (msg.erro ?? "A resposta falhou.")}</span>
      {aoTentar && !interrompida ? (
        <Botao pequeno variante="fantasma" icone={RotateCcw} onClick={aoTentar}>
          Tentar de novo
        </Botao>
      ) : null}
    </div>
  );
}

/** Uma resposta já gravada pela API. */
function RespostaGravada({
  msg,
  animar,
  aoRegenerar,
}: {
  readonly msg: MensagemAssistente;
  readonly animar: boolean;
  readonly aoRegenerar?: (() => void) | undefined;
}) {
  const quem = [msg.provedor ? NOME_PROVEDOR[msg.provedor] : null, msg.modelo].filter(Boolean).join(" · ");
  return (
    <Item animar={animar} className="msg msg--assistente">
      <Enso tamanho={24} className="msg__avatar" />
      <div className="msg__corpo">
        <Etapas etapas={msg.ferramentas} estadoDe={SEMPRE_FEITA} />
        {msg.texto ? <Markdown texto={msg.texto} /> : null}
        <AvisoGravado msg={msg} aoTentar={aoRegenerar} />
        <Fontes lista={msg.fontes} />
        <Acoes
          texto={msg.texto}
          criadaEm={msg.criadaEm}
          detalhe={quem || undefined}
          rotuloCopiar="Copiar a resposta"
          aoRegenerar={aoRegenerar}
        />
      </div>
    </Item>
  );
}

/** A resposta chegando: consultas com spinner, texto com cursor, e o erro com "Tentar de novo". */
function RespostaChegando({ r, aoTentar }: { readonly r: RespostaAoVivo; readonly aoTentar: () => void }) {
  const andando = emAndamento(r);
  const escrevendo = r.situacao === "escrevendo";
  return (
    <Item animar className="msg msg--assistente">
      <Enso tamanho={24} className={`msg__avatar ${andando ? "respirar" : ""}`} />
      <div className={`msg__corpo ${escrevendo ? "msg__corpo--escrevendo" : ""}`} aria-busy={andando}>
        <Etapas etapas={r.etapas} estadoDe={(i) => estadoDaEtapa(r, i)} />
        {r.texto ? <Markdown texto={andando ? textoParaMostrar(r.texto) : r.texto} /> : null}
        {andando && !r.texto && r.etapas.length === 0 ? (
          <p className="msg__pensando">Pensando com os seus dados…</p>
        ) : null}
        {r.situacao === "interrompida" ? (
          <div className="msg__aviso msg__aviso--interrompida">
            <PauseCircle size={16} aria-hidden="true" />
            <span>Resposta interrompida.</span>
          </div>
        ) : null}
        {r.situacao === "erro" ? (
          <div className="msg__aviso msg__aviso--erro" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{r.erro}</span>
            <Botao pequeno variante="fantasma" icone={RotateCcw} onClick={aoTentar}>
              Tentar de novo
            </Botao>
          </div>
        ) : null}
        <Fontes lista={r.fontes} />
      </div>
    </Item>
  );
}

/** As mensagens da conversa. Só as que chegam depois de abrir a conversa entram animadas. */
export function ListaMensagens({
  mensagens,
  aoVivo,
  aoRegenerar,
  aoTentarDeNovo,
}: {
  readonly mensagens: readonly MensagemAssistente[];
  readonly aoVivo: RespostaAoVivo | null;
  readonly aoRegenerar: (() => void) | null;
  readonly aoTentarDeNovo: (pergunta: string) => void;
}) {
  const [iniciais] = useState(() => new Set(mensagens.map((msg) => msg.id)));
  // A resposta gravada que substitui a que estava chegando não entra animada de novo.
  const jaNaTela = (id: string) => iniciais.has(id) || id === aoVivo?.usuario?.id || id === aoVivo?.final?.id;
  const ids = new Set(mensagens.map((msg) => msg.id));
  const ultima = mensagens.at(-1);
  const mostrarPergunta = aoVivo && (!aoVivo.usuario || !ids.has(aoVivo.usuario.id));
  const mostrarResposta = aoVivo && (!aoVivo.final || !ids.has(aoVivo.final.id));
  return (
    <ol className="mensagens" aria-label="Mensagens">
      {mensagens.map((msg) => {
        const animar = !jaNaTela(msg.id);
        if (msg.papel === "usuario")
          return <Pergunta key={msg.id} texto={msg.texto} criadaEm={msg.criadaEm} animar={animar} />;
        const regenerar = msg === ultima && !aoVivo && aoRegenerar ? aoRegenerar : undefined;
        return <RespostaGravada key={msg.id} msg={msg} animar={animar} aoRegenerar={regenerar} />;
      })}
      {aoVivo && mostrarPergunta ? (
        <Pergunta
          key="pergunta-ao-vivo"
          texto={aoVivo.pergunta}
          criadaEm={aoVivo.usuario?.criadaEm ?? aoVivo.iniciadaEm}
          animar
        />
      ) : null}
      {aoVivo && mostrarResposta ? (
        <RespostaChegando
          key="resposta-ao-vivo"
          r={aoVivo}
          aoTentar={() => aoTentarDeNovo(aoVivo.pergunta)}
        />
      ) : null}
    </ol>
  );
}
