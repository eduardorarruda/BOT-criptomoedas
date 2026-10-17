import {
  CodigoAutorizacaoClaude,
  type ConexaoClaude,
  type EstadoTokenClaude,
} from "@zentrade/contratos/esquemas";
import { Check, ExternalLink, Link2, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { Botao } from "../../componentes/Botao";
import { CampoTexto } from "../../componentes/Campo";
import { useAgora } from "../../ganchos/useAgora";
import { useComConfirmacao } from "../../sessao/Reautenticacao";
import type { ApiAssistente } from "./api";

/**
 * "Conectar meu Claude" em três passos, sem terminal: o servidor abre a conexão oficial
 * (o `claude setup-token` roda no agente), a pessoa autoriza na página do Claude e cola o
 * código que aparece. O token nunca passa pela tela: o agente o grava cifrado.
 */
type Fase =
  | { readonly tipo: "inicio" }
  | { readonly tipo: "abrindo" }
  | { readonly tipo: "autorizar"; readonly conexao: ConexaoClaude; readonly abriu: boolean }
  | { readonly tipo: "conferindo"; readonly conexao: ConexaoClaude }
  | { readonly tipo: "erro"; readonly mensagem: string };

const PASSOS = ["Conectar", "Autorizar no Claude", "Colar o código"] as const;

function passoAtual(f: Fase): number {
  if (f.tipo === "autorizar") return f.abriu ? 2 : 1;
  if (f.tipo === "conferindo") return 2;
  return 0;
}

function Passos({ atual }: { readonly atual: number }) {
  return (
    <ol className="passos-claude" aria-label="Passos para conectar">
      {PASSOS.map((nome, i) => {
        const estado = i < atual ? "feito" : i === atual ? "atual" : "falta";
        return (
          <li
            key={nome}
            className={`passos-claude__passo passos-claude__passo--${estado}`}
            aria-current={i === atual ? "step" : undefined}
          >
            <span className="passos-claude__marca" aria-hidden="true">
              {estado === "feito" ? <Check size={14} strokeWidth={2.6} /> : i + 1}
            </span>
            <span className="passos-claude__nome">
              {nome}
              {estado === "feito" ? <span className="so-leitor"> (feito)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** "9:41": quanto falta para a conexão vencer. */
function Contagem({ expiraEm, aoVencer }: { readonly expiraEm: number; readonly aoVencer: () => void }) {
  const agora = useAgora(1000);
  const restante = Math.max(0, expiraEm - agora);
  useEffect(() => {
    if (restante === 0) aoVencer();
  }, [restante, aoVencer]);
  const s = Math.ceil(restante / 1000);
  return (
    <p className="conectar-claude__contagem apagado">
      Esta conexão vale por mais{" "}
      <span className="num" role="timer" aria-live="off">
        {Math.floor(s / 60)}:{doisDigitos(s % 60)}
      </span>
      .
    </p>
  );
}

function Autorizar({
  fase,
  aoAbrir,
  aoEnviar,
  aoCancelar,
  aoVencer,
}: {
  readonly fase: Extract<Fase, { tipo: "autorizar" | "conferindo" }>;
  readonly aoAbrir: () => void;
  readonly aoEnviar: (codigo: string) => void;
  readonly aoCancelar: () => void;
  readonly aoVencer: () => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const conferindo = fase.tipo === "conferindo";
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const lido = CodigoAutorizacaoClaude.safeParse(codigo);
    if (!lido.success) {
      setErro(
        codigo.trim() === ""
          ? "Cole o código que o Claude mostrou depois de autorizar."
          : "Cole o código exatamente como o Claude mostrou, sem espaços no meio.",
      );
      return;
    }
    setErro(null);
    aoEnviar(lido.data);
  };
  return (
    <div className="conectar-claude__autorizar">
      <a
        href={fase.conexao.urlAutorizacao}
        target="_blank"
        rel="noopener noreferrer"
        className="botao botao--primario conectar-claude__abrir"
        onClick={aoAbrir}
      >
        <ExternalLink size={16} aria-hidden="true" />
        Abrir autorização no Claude
        <span className="so-leitor"> (abre em outra aba)</span>
      </a>
      <p className="apagado">
        Entre com a <strong>sua</strong> conta do Claude e clique em Autorizar.
      </p>
      <Contagem expiraEm={fase.conexao.expiraEm} aoVencer={aoVencer} />
      <form className="conectar-claude__codigo" onSubmit={enviar} noValidate autoComplete="off">
        <CampoTexto
          rotulo="Depois de autorizar, o Claude mostra um código. Cole aqui:"
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value);
            setErro(null);
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          className="campo--mono"
          erro={erro}
          disabled={conferindo}
        />
        <div className="formulario__acoes">
          <Botao variante="fantasma" icone={X} onClick={aoCancelar} disabled={conferindo}>
            Cancelar
          </Botao>
          <Botao type="submit" variante="primario" icone={Check} carregando={conferindo}>
            {conferindo ? "Conferindo o código…" : "Concluir conexão"}
          </Botao>
        </div>
      </form>
    </div>
  );
}

export function ConectarClaude({
  api,
  bloqueio,
  aoConectar,
  aoDesistir,
}: {
  readonly api: ApiAssistente;
  /** Por que não dá para começar agora (ex.: 2FA desligado); null = pode. */
  readonly bloqueio: string | null;
  readonly aoConectar: (estado: EstadoTokenClaude) => void;
  /** Só quando já há um Claude conectado (Reconectar): volta para o cartão. */
  readonly aoDesistir?: () => void;
}) {
  const [fase, setFase] = useState<Fase>({ tipo: "inicio" });
  const comConfirmacao = useComConfirmacao();
  const idTitulo = useId();
  // Sair da tela no meio da conexão cancela a do servidor (o CLI não fica esperando à toa).
  const aberta = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (aberta.current) void api.cancelarConexaoClaude(aberta.current).catch(() => undefined);
    },
    [api],
  );

  const iniciar = async () => {
    setFase({ tipo: "abrindo" });
    try {
      const conexao = await comConfirmacao(() => api.iniciarConexaoClaude());
      aberta.current = conexao.conexaoId;
      setFase({ tipo: "autorizar", conexao, abriu: false });
    } catch (e) {
      setFase({ tipo: "erro", mensagem: mensagemDe(e) });
    }
  };

  const enviarCodigo = async (conexao: ConexaoClaude, codigo: string) => {
    setFase({ tipo: "conferindo", conexao });
    try {
      const estado = await api.enviarCodigoClaude(conexao.conexaoId, codigo);
      aberta.current = null;
      setFase({ tipo: "inicio" });
      aoConectar(estado);
    } catch (e) {
      aberta.current = null;
      setFase({ tipo: "erro", mensagem: mensagemDe(e) });
    }
  };

  const cancelar = () => {
    if (aberta.current) void api.cancelarConexaoClaude(aberta.current).catch(() => undefined);
    aberta.current = null;
    setFase({ tipo: "inicio" });
    aoDesistir?.();
  };

  const vencer = () => {
    if (aberta.current) void api.cancelarConexaoClaude(aberta.current).catch(() => undefined);
    aberta.current = null;
    setFase({ tipo: "erro", mensagem: "A conexão venceu (ela vale 10 minutos). Comece de novo." });
  };

  return (
    <section className="conectar-claude" aria-labelledby={idTitulo}>
      <h3 id={idTitulo} className="so-leitor">
        Conectar o seu Claude
      </h3>
      <Passos atual={passoAtual(fase)} />
      {fase.tipo === "inicio" || fase.tipo === "abrindo" ? (
        <div className="conectar-claude__inicio">
          <p>
            O ZenTrade abre a autorização oficial da Anthropic. Você entra com a sua conta do Claude (plano
            Pro ou Max), autoriza e cola o código que aparecer. Tudo pelo navegador, sem terminal.
          </p>
          <div className="formulario__acoes">
            {aoDesistir ? (
              <Botao variante="fantasma" onClick={aoDesistir} disabled={fase.tipo === "abrindo"}>
                Voltar
              </Botao>
            ) : null}
            <Botao
              variante="primario"
              icone={Link2}
              carregando={fase.tipo === "abrindo"}
              disabled={bloqueio !== null}
              onClick={() => void iniciar()}
              className="conectar-claude__principal"
            >
              {fase.tipo === "abrindo" ? "Preparando a conexão…" : "Conectar meu Claude"}
            </Botao>
          </div>
        </div>
      ) : null}
      {fase.tipo === "autorizar" || fase.tipo === "conferindo" ? (
        <Autorizar
          fase={fase}
          aoAbrir={() => fase.tipo === "autorizar" && setFase({ ...fase, abriu: true })}
          aoEnviar={(codigo) => void enviarCodigo(fase.conexao, codigo)}
          aoCancelar={cancelar}
          aoVencer={vencer}
        />
      ) : null}
      {fase.tipo === "erro" ? (
        <div className="conectar-claude__erro">
          <p className="formulario__erro" role="alert">
            {fase.mensagem}
          </p>
          <div className="formulario__acoes">
            <Botao variante="fantasma" onClick={cancelar}>
              {aoDesistir ? "Voltar" : "Cancelar"}
            </Botao>
            <Botao
              variante="primario"
              icone={RotateCcw}
              disabled={bloqueio !== null}
              onClick={() => void iniciar()}
            >
              Tentar de novo
            </Botao>
          </div>
        </div>
      ) : null}
    </section>
  );
}
