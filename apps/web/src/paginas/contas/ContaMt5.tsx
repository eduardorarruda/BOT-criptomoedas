import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, LineChart, Plug, Save, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useFonte } from "../../api/contexto";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { Painel } from "../../componentes/Cabecalho";
import { CampoTexto } from "../../componentes/Campo";
import { Confirmar } from "../../componentes/Confirmar";
import { ErroCarregar, Esqueleto } from "../../componentes/Estados";
import { useComConfirmacao } from "../../sessao/Reautenticacao";
import { formatarRelativo } from "../../lib/tempo";
import { criarApiMt5, type ApiMt5 } from "./apiMt5";

const CHAVE = ["dados-mt5"] as const;
const VAZIO = { servidor: "", login: "", senha: "", simboloContinuo: "", fusoServidor: "" };

function Formulario({ api, aoSalvar }: { readonly api: ApiMt5; readonly aoSalvar: () => void }) {
  const comConfirmacao = useComConfirmacao();
  const avisar = useAvisos();
  const [c, setC] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mudar = (parcial: Partial<typeof VAZIO>) => setC((atual) => ({ ...atual, ...parcial }));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{3,20}$/.test(c.login.trim()))
      return setErro("O login do MetaTrader 5 é um número (o da conta demo).");
    if (c.servidor.trim().length < 3 || c.senha.length === 0)
      return setErro("Informe o servidor da corretora e a senha da conta demo.");
    setErro(null);
    setSalvando(true);
    try {
      await comConfirmacao(() =>
        api.salvar({
          servidor: c.servidor.trim(),
          login: c.login.trim(),
          senha: c.senha,
          ...(c.simboloContinuo.trim() ? { simboloContinuo: c.simboloContinuo.trim() } : {}),
          ...(c.fusoServidor.trim() ? { fusoServidor: c.fusoServidor.trim() } : {}),
        }),
      );
      setC(VAZIO);
      avisar("sucesso", "Conta guardada cifrada. A senha não volta para a tela.");
      aoSalvar();
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form className="formulario" onSubmit={(e) => void enviar(e)} noValidate autoComplete="off">
      <p className="apagado">
        Use uma conta <strong>demo</strong> de uma corretora brasileira (XP, Clear, Genial, Rico…): o ZenTrade
        só lê os candles do mini índice por ela e nunca envia ordem.
      </p>
      <CampoTexto
        rotulo="Servidor"
        value={c.servidor}
        onChange={(e) => mudar({ servidor: e.target.value })}
      />
      <CampoTexto
        rotulo="Login"
        inputMode="numeric"
        value={c.login}
        onChange={(e) => mudar({ login: e.target.value })}
      />
      <CampoTexto
        rotulo="Senha da conta demo"
        type="password"
        autoComplete="new-password"
        value={c.senha}
        onChange={(e) => mudar({ senha: e.target.value })}
        dica="Vai cifrada para a API e nunca é mostrada de novo."
      />
      <CampoTexto
        rotulo="Símbolo contínuo (opcional)"
        value={c.simboloContinuo}
        onChange={(e) => mudar({ simboloContinuo: e.target.value })}
        dica="Deixe vazio para detectar (WIN$N, WIN$ ou WIN@). Use Testar conexão para ver o que a corretora tem."
      />
      <CampoTexto
        rotulo="Fuso do servidor (opcional)"
        value={c.fusoServidor}
        onChange={(e) => mudar({ fusoServidor: e.target.value })}
        dica="Vazio detecta pela abertura do pregão. Para servidor com horário de verão, use o nome (Europe/Athens); senão, um deslocamento como +03:00."
      />
      {erro ? (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="formulario__acoes">
        <Botao type="submit" variante="primario" icone={Save} carregando={salvando}>
          Guardar conta
        </Botao>
      </div>
      <p className="apagado">Guardar a conta pede que você confirme sua identidade.</p>
    </form>
  );
}

function Configurada({
  api,
  estado,
  aoMudar,
}: {
  readonly api: ApiMt5;
  readonly estado: NonNullable<ReturnType<typeof useEstado>["data"]>;
  readonly aoMudar: () => void;
}) {
  const avisar = useAvisos();
  const [testando, setTestando] = useState(false);
  const [simbolos, setSimbolos] = useState<readonly string[] | null>(null);
  const [removendo, setRemovendo] = useState(false);

  const testar = async () => {
    setTestando(true);
    try {
      const r = await api.testar();
      setSimbolos(r.ok ? r.simbolos : null);
      avisar(r.ok ? "sucesso" : "erro", r.ok ? "Conexão funcionando." : (r.erro ?? "A conexão falhou."));
    } catch (e) {
      avisar("erro", mensagemDe(e));
    } finally {
      setTestando(false);
      aoMudar();
    }
  };

  return (
    <div className="mt5">
      <p>
        Conta <span className="num">{estado.loginFinal}</span>
        {estado.simboloContinuo ? <> · símbolo {estado.simboloContinuo}</> : null}
        {estado.fusoServidor ? <> · fuso {estado.fusoServidor}</> : null}
      </p>
      {estado.ultimoErro ? (
        <p className="formulario__erro" role="alert">
          <CircleAlert size={14} aria-hidden="true" /> {estado.ultimoErro}
        </p>
      ) : (
        <p className="apagado">
          {estado.validadaEm ? (
            <>
              <CircleCheck size={14} aria-hidden="true" /> Testada {formatarRelativo(estado.validadaEm)}.
            </>
          ) : (
            "Ainda não testada."
          )}
        </p>
      )}
      {simbolos ? (
        <p className="apagado">
          Símbolos WIN* nesta corretora: {simbolos.length > 0 ? simbolos.join(", ") : "nenhum"}.
        </p>
      ) : null}
      <div className="formulario__acoes">
        <Botao icone={Plug} carregando={testando} onClick={() => void testar()}>
          Testar conexão
        </Botao>
        <Botao variante="fantasma" icone={Trash2} onClick={() => setRemovendo(true)}>
          Remover
        </Botao>
      </div>
      <Confirmar
        aberto={removendo}
        titulo="Remover a conta do MetaTrader 5?"
        rotuloConfirmar="Remover conta"
        aoCancelar={() => setRemovendo(false)}
        aoConfirmar={() => {
          setRemovendo(false);
          api
            .remover()
            .then(aoMudar)
            .catch((e: unknown) => avisar("erro", mensagemDe(e)));
        }}
      >
        A atualização do WIN pelo MetaTrader 5 para de funcionar até você cadastrar outra conta.
      </Confirmar>
    </div>
  );
}

const useEstado = (api: ApiMt5) => useQuery({ queryKey: CHAVE, queryFn: () => api.estado() });

/** "MetaTrader 5 (dados do mini índice)": a conta demo da corretora, só para ler candles do WIN. */
export function ContaMt5({ api: injetada }: { readonly api?: ApiMt5 } = {}) {
  const fonte = useFonte();
  const api = useMemo(() => injetada ?? criarApiMt5(), [injetada]);
  const qc = useQueryClient();
  const estado = useEstado(api);
  const recarregar = () => void qc.invalidateQueries({ queryKey: CHAVE });

  return (
    <Painel titulo="MetaTrader 5 (dados do mini índice)" id="titulo-mt5" icone={LineChart}>
      {fonte.demo ? (
        <p className="apagado">
          A conta do MetaTrader 5 funciona com a API rodando (fora do modo de demonstração).
        </p>
      ) : estado.isPending ? (
        <Esqueleto forma="lista" linhas={2} rotulo="Carregando a conta do MetaTrader 5" />
      ) : estado.error ? (
        <ErroCarregar erro={estado.error} tentarDeNovo={() => void estado.refetch()} />
      ) : estado.data.configurado ? (
        <Configurada api={api} estado={estado.data} aoMudar={recarregar} />
      ) : (
        <Formulario api={api} aoSalvar={recarregar} />
      )}
    </Painel>
  );
}
