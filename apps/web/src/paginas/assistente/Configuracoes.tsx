import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { EstadoAssistente, ProvedorIa } from "@zentrade/contratos/esquemas";
import { ArrowLeft, CircleCheck, CircleSlash, Save } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useFonte } from "../../api/contexto";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { Cabecalho, Painel } from "../../componentes/Cabecalho";
import { CampoSelecao, CampoTexto } from "../../componentes/Campo";
import { ErroCarregar, Esqueleto } from "../../componentes/Estados";
import { Selo } from "../../componentes/Selo";
import type { ApiAssistente } from "./api";
import "./assistente.css";
import { SeuClaude } from "./SeuClaude";
import { useApiAssistente } from "./useApiAssistente";
import { chavesAssistente } from "./useRespostaAoVivo";

const MODELO_VALIDO = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,99}$/;
const OUTRO = "__outro";

const PROVEDORES: readonly { id: ProvedorIa; titulo: string; texto: string; falta: string }[] = [
  {
    id: "api",
    titulo: "Claude pela API",
    texto:
      "Paga por uso, com a chave da Anthropic configurada no servidor. Custo de cada análise aparece nas decisões.",
    falta: "O servidor não tem ANTHROPIC_API_KEY.",
  },
  {
    id: "cli",
    titulo: "Claude Code (o seu plano)",
    texto:
      "Usa o Claude Code com o limite do seu plano (o Claude que você conectou acima ou o login do servidor). Só ferramentas de leitura do ZenTrade.",
    falta: "O Claude Code não está instalado no servidor do agente.",
  },
];

interface Rascunho {
  readonly provedor: ProvedorIa;
  readonly modelo: string;
  readonly contaCli: string;
}

function EscolhaProvedor({
  estado,
  valor,
  aoMudar,
}: {
  readonly estado: EstadoAssistente;
  readonly valor: ProvedorIa;
  readonly aoMudar: (p: ProvedorIa) => void;
}) {
  return (
    <fieldset className="config__provedores">
      <legend className="campo__rotulo">Quem responde</legend>
      {PROVEDORES.map((p) => {
        const disponivel = estado.provedores[p.id];
        return (
          <label
            key={p.id}
            className={`config__provedor ${valor === p.id ? "config__provedor--escolhido" : ""}`}
          >
            <input
              type="radio"
              name="provedor"
              value={p.id}
              checked={valor === p.id}
              disabled={!disponivel}
              onChange={() => aoMudar(p.id)}
            />
            <span className="config__provedor-texto">
              <strong>
                {p.id === "cli" && estado.tokenClaudeFinal
                  ? `Claude Code (seu token ${estado.tokenClaudeFinal})`
                  : p.titulo}
              </strong>
              <span className="apagado">{disponivel ? p.texto : p.falta}</span>
            </span>
            <Selo tom={disponivel ? "ganho" : "neutro"} icone={disponivel ? CircleCheck : CircleSlash}>
              {disponivel ? "Disponível" : "Indisponível"}
            </Selo>
          </label>
        );
      })}
    </fieldset>
  );
}

function EscolhaModelo({
  estado,
  r,
  aoMudar,
}: {
  readonly estado: EstadoAssistente;
  readonly r: Rascunho;
  readonly aoMudar: (modelo: string) => void;
}) {
  const sugeridos = estado.modelos[r.provedor];
  const conhecido = r.modelo === "" || sugeridos.some((m) => m.id === r.modelo);
  const [outro, setOutro] = useState(!conhecido);
  const erro =
    r.modelo !== "" && !MODELO_VALIDO.test(r.modelo)
      ? "Use letras, números e . _ : / @ - (sem começar com -)."
      : null;
  return (
    <>
      <CampoSelecao
        rotulo="Modelo"
        value={outro ? OUTRO : r.modelo}
        onChange={(e) => {
          const v = e.target.value;
          setOutro(v === OUTRO);
          aoMudar(v === OUTRO ? "" : v);
        }}
        dica="O padrão do servidor serve para a maioria. Modelos maiores pensam melhor e custam (ou gastam do plano) mais."
      >
        <option value="">Padrão do servidor</option>
        {sugeridos.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome} — {m.descricao}
          </option>
        ))}
        <option value={OUTRO}>Outro…</option>
      </CampoSelecao>
      {outro ? (
        <CampoTexto
          rotulo="Nome do modelo"
          value={r.modelo}
          onChange={(e) => aoMudar(e.target.value.trim())}
          erro={erro}
          maxLength={100}
        />
      ) : null}
    </>
  );
}

function EscolhaConta({
  estado,
  valor,
  aoMudar,
}: {
  readonly estado: EstadoAssistente;
  readonly valor: string;
  readonly aoMudar: (id: string) => void;
}) {
  const conta = estado.contasCli.find((c) => c.id === valor);
  return (
    <CampoSelecao
      rotulo="Conta do Claude Code"
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      dica={
        conta && !conta.logada
          ? "Essa conta ainda não tem login neste servidor. Veja em docs/operacao.md como entrar uma vez."
          : "Cada conta é uma pasta de login no servidor (CLAUDE_CONFIG_DIR). Quem opera o servidor cria as contas."
      }
    >
      <option value="">A primeira conta configurada</option>
      {estado.contasCli.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nome} {c.logada ? "(com login)" : "(sem login)"}
        </option>
      ))}
    </CampoSelecao>
  );
}

function Formulario({ api, estado }: { readonly api: ApiAssistente; readonly estado: EstadoAssistente }) {
  const qc = useQueryClient();
  const avisar = useAvisos();
  const inicial = useMemo<Rascunho>(
    () => ({
      provedor: estado.config.provedor,
      modelo: estado.config.modelo ?? "",
      contaCli: estado.config.contaCli ?? "",
    }),
    [estado.config],
  );
  const [r, setR] = useState<Rascunho>(inicial);
  const salvar = useMutation({
    mutationFn: () =>
      api.mudarConfig({
        provedor: r.provedor,
        modelo: r.modelo || null,
        contaCli: r.provedor === "cli" ? r.contaCli || null : estado.config.contaCli,
      }),
    onSuccess: (novo) => {
      qc.setQueryData(chavesAssistente.estado, novo);
      avisar(
        "sucesso",
        "Configuração salva. Vale para a próxima análise e a próxima resposta do assistente.",
      );
    },
    onError: (e) => avisar("erro", mensagemDe(e)),
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (r.modelo && !MODELO_VALIDO.test(r.modelo)) return;
    salvar.mutate();
  };
  return (
    <form className="formulario config" onSubmit={enviar} noValidate>
      <EscolhaProvedor
        estado={estado}
        valor={r.provedor}
        aoMudar={(provedor) => setR({ ...r, provedor, modelo: "" })}
      />
      <EscolhaModelo key={r.provedor} estado={estado} r={r} aoMudar={(modelo) => setR({ ...r, modelo })} />
      {r.provedor === "cli" && estado.tokenClaudeFinal ? (
        <p className="apagado">
          Com o seu Claude conectado, a conta do servidor não é usada: o Claude Code roda com o seu token.
        </p>
      ) : r.provedor === "cli" ? (
        <EscolhaConta estado={estado} valor={r.contaCli} aoMudar={(contaCli) => setR({ ...r, contaCli })} />
      ) : null}
      <div className="formulario__acoes">
        <Botao
          type="submit"
          variante="primario"
          icone={Save}
          carregando={salvar.isPending}
          disabled={!estado.agenteNoAr}
        >
          Salvar
        </Botao>
      </div>
    </form>
  );
}

/** Assistente → Configurações: quem responde (API ou Claude Code), o modelo e a conta. */
export function Configuracoes({ api: apiInjetada }: { readonly api?: ApiAssistente } = {}) {
  const fonte = useFonte();
  const api = useApiAssistente(apiInjetada);
  const estado = useQuery({ queryKey: chavesAssistente.estado, queryFn: () => api.estado() });
  return (
    <>
      <Cabecalho
        titulo="Configurações do assistente"
        acoes={
          <Link to="/assistente" className="botao botao--fantasma">
            <ArrowLeft size={16} aria-hidden="true" /> Voltar ao assistente
          </Link>
        }
      >
        Conecte o seu Claude e escolha quem analisa os sinais dos seus robôs e responde no assistente. Vale
        para os dois.
      </Cabecalho>
      {fonte.demo ? (
        <p className="config__termos apagado">
          Modo de demonstração: a escolha vale só nesta aba e nenhuma IA é chamada.
        </p>
      ) : null}
      <SeuClaude api={api} />
      <Painel titulo="Cérebro do analista e do assistente" id="titulo-config">
        {estado.isPending ? <Esqueleto linhas={4} rotulo="Carregando a configuração" /> : null}
        {estado.error ? (
          <ErroCarregar erro={estado.error} tentarDeNovo={() => void estado.refetch()} />
        ) : null}
        {estado.data && !estado.data.agenteNoAr ? (
          <p className="config__aviso" role="status">
            O agente de IA não respondeu. Dá para ver a configuração, mas não para trocar agora.
          </p>
        ) : null}
        {estado.data ? (
          <Formulario key={JSON.stringify(estado.data.config)} api={api} estado={estado.data} />
        ) : null}
        <p className="config__termos apagado">
          Usar o Claude Code pelo seu plano segue os termos de uso da Anthropic: o plano é pessoal, para você
          mesmo. O analista continua só propondo: o motor de risco decide, e nada aqui envia ordem.
        </p>
      </Painel>
    </>
  );
}
