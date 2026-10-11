import { ShieldCheck } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useFonte } from "../api/contexto";
import { ErroApi, ehErroApi, mensagemDe } from "../api/erros";
import { Botao } from "../componentes/Botao";
import { CampoTexto } from "../componentes/Campo";
import { Dialogo } from "../componentes/Dialogo";

/**
 * Ações críticas (desligar a parada total, cadastrar chave de corretora, ligar o
 * automático com dinheiro real) exigem confirmar a identidade nos últimos 5 min.
 * `comConfirmacao` tenta a ação; se a API pedir, abre o diálogo, confirma e tenta
 * de novo. Se a pessoa desistir, a ação é cancelada com uma mensagem clara.
 */
type ComConfirmacao = <T>(acao: () => Promise<T>) => Promise<T>;
const ContextoConfirmacao = createContext<ComConfirmacao | null>(null);

interface Pendente {
  readonly resolver: () => void;
  readonly rejeitar: (e: unknown) => void;
}

export const erroCancelado = (): ErroApi =>
  new ErroApi("cancelado", "Ação cancelada: sua identidade não foi confirmada. Nada foi alterado.");

export function ProvedorReautenticacao({ children }: { readonly children: ReactNode }) {
  const pendente = useRef<Pendente | null>(null);
  const [aberto, setAberto] = useState(false);

  const pedir = useCallback(
    () =>
      new Promise<void>((resolver, rejeitar) => {
        pendente.current = { resolver, rejeitar };
        setAberto(true);
      }),
    [],
  );

  const comConfirmacao = useCallback<ComConfirmacao>(
    async (acao) => {
      try {
        return await acao();
      } catch (e) {
        if (!ehErroApi(e) || e.codigo !== "reautenticacao_necessaria") throw e;
        await pedir();
        return await acao();
      }
    },
    [pedir],
  );

  const encerrar = (ok: boolean): void => {
    const p = pendente.current;
    pendente.current = null;
    setAberto(false);
    if (ok) p?.resolver();
    else p?.rejeitar(erroCancelado());
  };

  const valor = useMemo(() => comConfirmacao, [comConfirmacao]);
  return (
    <ContextoConfirmacao.Provider value={valor}>
      {children}
      <Dialogo
        aberto={aberto}
        aoFechar={() => encerrar(false)}
        titulo="Confirme que é você"
        descricao="Esta ação mexe com a segurança do seu dinheiro. Confirme sua identidade; ela vale por 5 minutos."
      >
        <FormConfirmacao aoConfirmar={() => encerrar(true)} aoCancelar={() => encerrar(false)} />
      </Dialogo>
    </ContextoConfirmacao.Provider>
  );
}

function FormConfirmacao({
  aoConfirmar,
  aoCancelar,
}: {
  readonly aoConfirmar: () => void;
  readonly aoCancelar: () => void;
}) {
  const fonte = useFonte();
  const [modo, setModo] = useState<"senha" | "codigo2fa">("senha");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!valor.trim()) {
      setErro(modo === "senha" ? "Digite sua senha." : "Digite o código de 6 dígitos do autenticador.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      await fonte.confirmarIdentidade(modo === "senha" ? { senha: valor } : { codigo2fa: valor });
      aoConfirmar();
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="formulario" onSubmit={enviar} noValidate>
      <div className="alternador" role="radiogroup" aria-label="Como confirmar">
        {(["senha", "codigo2fa"] as const).map((m) => (
          <label key={m} className="alternador__opcao">
            <input
              type="radio"
              name="modo-confirmacao"
              checked={modo === m}
              onChange={() => {
                setModo(m);
                setValor("");
                setErro(null);
              }}
            />
            <span>{m === "senha" ? "Senha" : "Código do autenticador"}</span>
          </label>
        ))}
      </div>
      {modo === "senha" ? (
        <CampoTexto
          rotulo="Sua senha"
          type="password"
          autoComplete="current-password"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          erro={erro}
          autoFocus
        />
      ) : (
        <CampoTexto
          rotulo="Código de 6 dígitos"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={valor}
          onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
          erro={erro}
          className="campo--codigo"
          autoFocus
        />
      )}
      <div className="formulario__acoes">
        <Botao variante="fantasma" onClick={aoCancelar}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" icone={ShieldCheck} carregando={enviando}>
          Confirmar
        </Botao>
      </div>
    </form>
  );
}

export function useComConfirmacao(): ComConfirmacao {
  const ctx = useContext(ContextoConfirmacao);
  if (!ctx) throw new Error("useComConfirmacao precisa estar dentro de <ProvedorReautenticacao>");
  return ctx;
}
