import { useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, FlaskConical, LogIn, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useFonte } from "../api/contexto";
import { ehErroApi, mensagemDe } from "../api/erros";
import { Botao } from "../componentes/Botao";
import { CampoTexto } from "../componentes/Campo";
import { CenaFumaca } from "../componentes/CenaFumaca";
import { Enso } from "../componentes/Enso";
import { useEntrar } from "../ganchos/mutacoes";
import { RodapeLegal } from "../layout/RodapeLegal";

/** Login em dois passos: e-mail e senha; depois, o código do autenticador (2FA). */
export function Entrar() {
  const fonte = useFonte();
  const navegar = useNavigate();
  const { voltar } = useSearch({ from: "/entrar" });
  const entrar = useEntrar();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [passo, setPasso] = useState<"senha" | "codigo">("senha");
  const [erro, setErro] = useState<string | null>(null);

  const concluir = (): void => void navegar({ to: voltar ?? "/" });

  const tentar = (credenciais: Parameters<typeof entrar.mutate>[0]): void => {
    setErro(null);
    entrar.mutate(credenciais, {
      onSuccess: concluir,
      onError: (e) => {
        if (ehErroApi(e) && e.codigo === "codigo2fa_necessario") {
          setPasso("codigo");
          return;
        }
        setErro(mensagemDe(e));
      },
    });
  };

  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    if (passo === "senha") {
      if (!email.includes("@") || senha.length === 0) {
        setErro("Digite seu e-mail e sua senha.");
        return;
      }
      tentar({ email, senha });
      return;
    }
    if (!/^\d{6}$/.test(codigo)) {
      setErro("O código tem 6 números. Abra o app autenticador e digite o código atual.");
      return;
    }
    tentar({ email, senha, codigo2fa: codigo });
  };

  return (
    <div className="entrar">
      <section className="entrar__marca" aria-hidden="true">
        <CenaFumaca alvo=".enso" className="entrar__cena" />
        <Enso tamanho={360} animar tom="tinta" className="entrar__enso" />
        <p className="entrar__lema titulo-serif">
          Calma para decidir.
          <br />
          <span className="entrar__lema-destaque">Disciplina</span> para executar.
        </p>
      </section>
      <section className="entrar__formulario" role="main" aria-labelledby="titulo-entrar">
        <h1 id="titulo-entrar" className="entrar__titulo">
          <span className="marca__zen">Zen</span>
          <span className="marca__trade">Trade</span>
        </h1>
        <p className="entrar__subtitulo">
          {passo === "senha" ? "Entre para acompanhar seus robôs." : "Falta um passo: confirme que é você."}
        </p>

        <form className="formulario" onSubmit={enviar} noValidate>
          {passo === "senha" ? (
            <>
              <CampoTexto
                rotulo="E-mail"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <CampoTexto
                rotulo="Senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </>
          ) : (
            <CampoTexto
              rotulo="Código do autenticador"
              dica="Os 6 números que aparecem agora no seu app autenticador."
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              className="campo--codigo"
              // eslint-disable-next-line jsx-a11y-x/no-autofocus -- o campo do código aparece depois do envio; o foco vai para ele
              autoFocus
            />
          )}
          {erro ? (
            <p className="formulario__erro" role="alert">
              {erro}
            </p>
          ) : null}
          <div className="formulario__acoes formulario__acoes--empilhadas">
            <Botao
              type="submit"
              variante="primario"
              icone={passo === "senha" ? LogIn : ShieldCheck}
              carregando={entrar.isPending}
            >
              {passo === "senha" ? "Entrar" : "Confirmar código"}
            </Botao>
            {passo === "codigo" ? (
              <Botao
                variante="fantasma"
                icone={ArrowLeft}
                onClick={() => {
                  setPasso("senha");
                  setCodigo("");
                  setErro(null);
                }}
              >
                Voltar
              </Botao>
            ) : null}
          </div>
        </form>

        {fonte.demo ? (
          <div className="entrar__demo">
            <p>
              <FlaskConical size={16} aria-hidden="true" /> <strong>Modo de exemplo.</strong> Qualquer e-mail
              e senha servem; o código é qualquer número de 6 dígitos.
            </p>
            <Botao
              variante="secundario"
              onClick={() => tentar({ email: "voce@exemplo.com", senha: "exemplo", codigo2fa: "123456" })}
            >
              Entrar no exemplo
            </Botao>
          </div>
        ) : null}
        <p className="entrar__aviso">
          Software de apoio à decisão. Operar cripto envolve risco de perda, inclusive total. Nada aqui é
          promessa de lucro.
        </p>
        <RodapeLegal className="entrar__rodape-legal" />
      </section>
    </div>
  );
}
