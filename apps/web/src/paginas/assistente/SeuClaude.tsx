import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { EstadoAssistente, EstadoTokenClaude } from "@zentrade/contratos/esquemas";
import { Check, CircleAlert, PlugZap, RefreshCw, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { Painel } from "../../componentes/Cabecalho";
import { Confirmar } from "../../componentes/Confirmar";
import { ErroCarregar, Esqueleto } from "../../componentes/Estados";
import { Selo } from "../../componentes/Selo";
import { useSessao } from "../../ganchos/consultas";
import { formatarData, formatarRelativo } from "../../lib/tempo";
import type { ApiAssistente } from "./api";
import { ColarToken } from "./ColarToken";
import { ConectarClaude } from "./ConectarClaude";
import "./seu-claude.css";
import { useApiAssistente, useEstadoAssistente, useTokenClaude } from "./useApiAssistente";
import { chavesAssistente } from "./useRespostaAoVivo";

/** Por que não dá para conectar agora; null = dá. */
function bloqueioDe(doisFatores: boolean | undefined, estado: EstadoAssistente | undefined): string | null {
  if (estado && !estado.agenteNoAr)
    return "O agente de IA está fora do ar agora. Tente de novo em instantes.";
  if (doisFatores === false && estado?.claudeExige2fa !== false)
    return "Ligue a verificação em duas etapas (2FA) antes de conectar o seu Claude.";
  return null;
}

function Testado({ t }: { readonly t: EstadoTokenClaude }) {
  if (t.ultimoErro) {
    return (
      <p className="seu-claude__erro" role="alert">
        <CircleAlert size={14} aria-hidden="true" /> {t.ultimoErro}
      </p>
    );
  }
  return (
    <p className="apagado">
      {t.validadaEm
        ? `Testado ${formatarRelativo(t.validadaEm)}: respondeu normalmente.`
        : "Ainda não testado. Use Testar para conferir com uma chamada mínima."}
    </p>
  );
}

/** O cartão de conta conectada: final do token, validade, último teste e as ações. */
function Conectado({
  t,
  estado,
  testando,
  aoTestar,
  aoReconectar,
  aoRemover,
  aoUsar,
}: {
  readonly t: EstadoTokenClaude;
  readonly estado: EstadoAssistente | undefined;
  readonly testando: boolean;
  readonly aoTestar: () => void;
  readonly aoReconectar: () => void;
  readonly aoRemover: () => void;
  readonly aoUsar: () => void;
}) {
  const usando = estado?.config.provedor === "cli";
  return (
    <div className={`seu-claude__cartao ${t.ultimoErro ? "seu-claude__cartao--erro" : ""}`}>
      <span className="seu-claude__marca" aria-hidden="true">
        {t.ultimoErro ? <ShieldAlert size={18} /> : <Check size={18} strokeWidth={2.6} />}
      </span>
      <div className="seu-claude__textos">
        <p className="seu-claude__linha">
          <strong>{t.ultimoErro ? "Precisa reconectar" : "Conectado"}</strong>
          <span aria-hidden="true"> · </span>
          <span>
            termina em <span className="num">{t.final}</span>
          </span>
          {t.validoAte ? (
            <>
              <span aria-hidden="true"> · </span>
              <span>válido até {formatarData(t.validoAte)}</span>
            </>
          ) : null}
        </p>
        <Testado t={t} />
        {estado?.provedores.cli && !usando ? (
          <p className="seu-claude__uso">
            O assistente e o analista ainda usam a API da Anthropic.{" "}
            <button type="button" className="link-seta" onClick={aoUsar}>
              Usar o meu Claude
            </button>
          </p>
        ) : usando ? (
          <p className="apagado">
            O analista dos robôs e o assistente usam este Claude, com o limite do seu plano.
          </p>
        ) : null}
      </div>
      <div className="seu-claude__acoes">
        <Botao pequeno icone={PlugZap} carregando={testando} onClick={aoTestar}>
          Testar
        </Botao>
        <Botao pequeno variante="fantasma" icone={RefreshCw} onClick={aoReconectar}>
          Reconectar
        </Botao>
        <Botao pequeno variante="fantasma" icone={Trash2} onClick={aoRemover}>
          Remover
        </Botao>
      </div>
    </div>
  );
}

function Indisponivel({ estado }: { readonly estado: EstadoAssistente }) {
  return (
    <p className="seu-claude__indisponivel" role="status">
      {estado.agenteNoAr
        ? "Este servidor ainda não usa o Claude de cada pessoa: falta o Claude Code ou a ZENTRADE_CHAVE_MESTRA no agente. Quem opera o servidor encontra o passo a passo em docs/operacao.md."
        : "O agente de IA está fora do ar. Dá para ver se o seu Claude está conectado, mas não para mudar agora."}
    </p>
  );
}

/**
 * "Claude Code (seu plano)": a pessoa conecta a própria conta do Claude (Pro ou Max) e o
 * analista e o assistente passam a usar o plano dela. Cada pessoa conecta a sua; o
 * token fica cifrado no servidor e a tela só mostra o final.
 */
export function SeuClaude({ api: injetada }: { readonly api?: ApiAssistente } = {}) {
  const api = useApiAssistente(injetada);
  const qc = useQueryClient();
  const avisar = useAvisos();
  const sessao = useSessao();
  const estado = useEstadoAssistente(api);
  const token = useTokenClaude(api);
  const [reconectando, setReconectando] = useState(false);
  const [removendo, setRemovendo] = useState(false);

  const gravar = (t: EstadoTokenClaude) => {
    qc.setQueryData(chavesAssistente.tokenClaude, t);
    void qc.invalidateQueries({ queryKey: chavesAssistente.estado });
  };
  const testar = useMutation({
    mutationFn: () => api.testarTokenClaude(),
    onSuccess: (r) => {
      gravar(r.estado);
      avisar(
        r.ok ? "sucesso" : "erro",
        r.ok ? "O seu Claude respondeu. Está tudo certo." : (r.mensagem ?? "O teste falhou."),
      );
    },
    onError: (e) => avisar("erro", mensagemDe(e)),
  });
  const usar = useMutation({
    mutationFn: () => api.mudarConfig({ provedor: "cli", modelo: null }),
    onSuccess: (novo) => qc.setQueryData(chavesAssistente.estado, novo),
    onError: (e) => avisar("erro", mensagemDe(e)),
  });
  const remover = useMutation({
    mutationFn: () => api.removerTokenClaude(),
    onSuccess: async () => {
      setRemovendo(false);
      await qc.invalidateQueries({ queryKey: chavesAssistente.tokenClaude });
      void qc.invalidateQueries({ queryKey: chavesAssistente.estado });
      avisar(
        "sucesso",
        "Claude desconectado. Para invalidar o token de vez, revogue-o também na sua conta do Claude.",
      );
    },
    onError: (e) => avisar("erro", mensagemDe(e)),
  });

  /** Conectou (pelo botão ou colando): passa a usar o Claude da pessoa e confere na hora. */
  const conectou = (t: EstadoTokenClaude) => {
    gravar(t);
    setReconectando(false);
    avisar("sucesso", `Pronto: o seu Claude está conectado (termina em ${t.final ?? "…"}). Conferindo…`);
    if (estado.data?.provedores.cli && estado.data.config.provedor !== "cli") usar.mutate();
    testar.mutate();
  };

  const e = estado.data;
  const capacidade = e?.tokenClaude;
  const bloqueio = bloqueioDe(sessao.data?.doisFatores, e);
  const conectado = token.data?.configurado === true;
  return (
    <Painel
      titulo="Claude Code (seu plano)"
      id="titulo-seu-claude"
      icone={Sparkles}
      descricao="Conecte a sua conta do Claude (Pro ou Max) para o analista e o assistente usarem o seu plano. Cada pessoa conecta a própria conta."
      acoes={
        conectado ? (
          <Selo
            tom={token.data?.ultimoErro ? "atencao" : "marca"}
            icone={token.data?.ultimoErro ? ShieldAlert : Check}
          >
            {token.data?.ultimoErro ? "Reconectar" : "Conectado"}
          </Selo>
        ) : null
      }
      className="seu-claude"
    >
      {token.isPending || estado.isPending ? <Esqueleto linhas={3} rotulo="Carregando o seu Claude" /> : null}
      {token.error ? <ErroCarregar erro={token.error} tentarDeNovo={() => void token.refetch()} /> : null}
      {e && (!e.agenteNoAr || !capacidade?.usar) ? <Indisponivel estado={e} /> : null}
      {e && sessao.data && !sessao.data.doisFatores && e.claudeExige2fa !== false && !conectado ? (
        <p className="seu-claude__aviso" role="note">
          <ShieldAlert size={16} aria-hidden="true" />
          <span>
            Para conectar, ligue antes a verificação em duas etapas (2FA): o seu Claude fica guardado no
            servidor, e o 2FA protege a sua conta.{" "}
            <Link to="/contas" className="link-seta">
              Ligar o 2FA em Contas e chaves
            </Link>
          </span>
        </p>
      ) : null}
      {token.data && conectado && !reconectando ? (
        <Conectado
          t={token.data}
          estado={e}
          testando={testar.isPending}
          aoTestar={() => testar.mutate()}
          aoReconectar={() => setReconectando(true)}
          aoRemover={() => setRemovendo(true)}
          aoUsar={() => usar.mutate()}
        />
      ) : null}
      {token.data && e && capacidade?.conectar && (!conectado || reconectando) ? (
        <ConectarClaude
          api={api}
          bloqueio={bloqueio}
          aoConectar={conectou}
          {...(reconectando ? { aoDesistir: () => setReconectando(false) } : {})}
        />
      ) : null}
      {token.data && e && capacidade?.usar && (!conectado || reconectando) ? (
        <ColarToken api={api} bloqueio={bloqueio} aberto={!capacidade.conectar} aoSalvar={conectou} />
      ) : null}
      <Confirmar
        aberto={removendo}
        titulo="Desconectar o seu Claude?"
        rotuloConfirmar="Desconectar"
        carregando={remover.isPending}
        aoCancelar={() => setRemovendo(false)}
        aoConfirmar={() => remover.mutate()}
      >
        O analista e o assistente deixam de usar o seu plano (o Claude Code volta para a conta do servidor, se
        houver). Para invalidar o token de vez, revogue-o também na sua conta do Claude.
      </Confirmar>
    </Painel>
  );
}
