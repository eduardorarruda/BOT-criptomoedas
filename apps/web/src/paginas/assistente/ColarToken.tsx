import { TokenClaude, type EstadoTokenClaude } from "@zentrade/contratos/esquemas";
import { Check, Copy, Eye, EyeOff, Save } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { Botao } from "../../componentes/Botao";
import { useCopiar } from "../../ganchos/useCopiar";
import { useComConfirmacao } from "../../sessao/Reautenticacao";
import type { ApiAssistente } from "./api";

const COMANDO = "claude setup-token";

/** Passo 1: o comando, com botão de copiar. */
function Comando() {
  const [copia, copiar] = useCopiar();
  return (
    <div className="colar-token__passo">
      <p className="dois-fatores__passo">
        <span className="dois-fatores__numero" aria-hidden="true">
          1
        </span>
        No seu computador, com o Claude Code instalado, rode:
      </p>
      <div className="dois-fatores__segredo">
        <code className="num">{COMANDO}</code>
        <Botao
          pequeno
          variante="fantasma"
          icone={copia === "copiado" ? Check : Copy}
          onClick={() => void copiar(COMANDO)}
          aria-label={copia === "copiado" ? "Comando copiado" : "Copiar o comando"}
        >
          {copia === "copiado" ? "Copiado" : "Copiar"}
        </Botao>
      </div>
      {copia === "falhou" ? (
        <p className="formulario__erro" role="alert">
          Não deu para copiar. Selecione o comando e copie com Ctrl+C.
        </p>
      ) : null}
      <p className="apagado">
        Ele abre o navegador para você autorizar e mostra um token que começa com <code>sk-ant-oat</code>.
        Precisa do plano Pro ou Max; o token vale 1 ano e só faz chamadas ao modelo.
      </p>
    </div>
  );
}

/** Passo 2: o campo de senha com mostrar/ocultar e o botão Salvar. */
function Formulario({
  api,
  bloqueio,
  aoSalvar,
}: {
  readonly api: ApiAssistente;
  readonly bloqueio: string | null;
  readonly aoSalvar: (estado: EstadoTokenClaude) => void;
}) {
  const comConfirmacao = useComConfirmacao();
  const id = useId();
  const [token, setToken] = useState("");
  const [visivel, setVisivel] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const idErro = `${id}-erro`;
  const idDica = `${id}-dica`;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const lido = TokenClaude.safeParse(token);
    if (!lido.success) {
      setErro(lido.error.issues[0]?.message ?? "Token inválido.");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const estado = await comConfirmacao(() => api.salvarTokenClaude(lido.data));
      setToken("");
      setVisivel(false);
      aoSalvar(estado);
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form className="colar-token__passo" onSubmit={(e) => void enviar(e)} noValidate autoComplete="off">
      <p className="dois-fatores__passo">
        <span className="dois-fatores__numero" aria-hidden="true">
          2
        </span>
        Cole o token aqui:
      </p>
      <div className="campo campo--mono">
        <label htmlFor={id} className="campo__rotulo">
          Token do Claude Code
        </label>
        <div className="colar-token__linha">
          <input
            id={id}
            className="campo__entrada"
            type={visivel ? "text" : "password"}
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setErro(null);
            }}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            placeholder="sk-ant-oat01-…"
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? `${idDica} ${idErro}` : idDica}
          />
          <Botao
            variante="fantasma"
            icone={visivel ? EyeOff : Eye}
            aria-pressed={visivel}
            aria-controls={id}
            onClick={() => setVisivel(!visivel)}
          >
            {visivel ? "Ocultar" : "Mostrar"}
          </Botao>
        </div>
        <span id={idDica} className="campo__dica">
          Vai cifrado para o servidor e nunca é mostrado de novo; aqui fica só o final.
        </span>
        {erro ? (
          <span id={idErro} className="campo__erro" role="alert">
            {erro}
          </span>
        ) : null}
      </div>
      <div className="formulario__acoes">
        <Botao
          type="submit"
          variante="primario"
          icone={Save}
          carregando={salvando}
          disabled={bloqueio !== null}
        >
          Salvar token
        </Botao>
      </div>
    </form>
  );
}

/**
 * A alternativa para quem prefere o terminal: rodar `claude setup-token` no próprio
 * computador e colar o token. Fica recolhida quando a conexão pelo botão existe.
 */
export function ColarToken({
  api,
  bloqueio,
  aberto,
  aoSalvar,
}: {
  readonly api: ApiAssistente;
  readonly bloqueio: string | null;
  /** Aberto de início quando o servidor não conecta pelo botão. */
  readonly aberto: boolean;
  readonly aoSalvar: (estado: EstadoTokenClaude) => void;
}) {
  return (
    <details className="colar-token" open={aberto || undefined}>
      <summary className="colar-token__resumo">Avançado: já tenho um token (claude setup-token)</summary>
      <div className="colar-token__corpo">
        <Comando />
        <Formulario api={api} bloqueio={bloqueio} aoSalvar={aoSalvar} />
      </div>
    </details>
  );
}
