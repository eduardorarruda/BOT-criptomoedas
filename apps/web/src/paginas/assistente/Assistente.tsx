import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MessagesSquare, Settings2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useFonte } from "../../api/contexto";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Cabecalho } from "../../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { criarApiAssistente, type ApiAssistente } from "./api";
import "./assistente.css";
import { CaixaPergunta, ListaMensagens, Sugestoes } from "./Conversa";
import { ListaConversas } from "./ListaConversas";
import { chavesAssistente, useRespostaAoVivo } from "./useRespostaAoVivo";

const NOME = { api: "Claude pela API", cli: "Claude Code (o seu plano)" } as const;

/** Quem está respondendo agora, para a pessoa saber de onde vem a resposta. */
function QuemResponde({ api }: { readonly api: ApiAssistente }) {
  const estado = useQuery({ queryKey: chavesAssistente.estado, queryFn: () => api.estado() });
  if (!estado.data) return null;
  const { config, agenteNoAr } = estado.data;
  return (
    <p className="chat__quem apagado">
      {agenteNoAr
        ? `Respondendo com ${NOME[config.provedor]}${config.modelo ? ` · ${config.modelo}` : ""}`
        : "O agente de IA está fora do ar."}{" "}
      <Link to="/assistente/configuracoes">Trocar</Link>
    </p>
  );
}

function useConversas(api: ApiAssistente) {
  const qc = useQueryClient();
  const avisar = useAvisos();
  const lista = useQuery({ queryKey: chavesAssistente.conversas, queryFn: () => api.conversas() });
  const criar = useMutation({
    mutationFn: () => api.criarConversa(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chavesAssistente.conversas }),
    onError: (e) => avisar("erro", mensagemDe(e)),
  });
  const apagar = useMutation({
    mutationFn: (id: string) => api.apagar(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chavesAssistente.conversas }),
    onError: (e) => avisar("erro", mensagemDe(e)),
  });
  return { lista, criar, apagar };
}

/** Painel da conversa aberta: mensagens, sugestões quando vazia, e a caixa da pergunta. */
function PainelConversa({
  api,
  conversaId,
  aoPrecisarDeConversa,
}: {
  readonly api: ApiAssistente;
  readonly conversaId: string | null;
  readonly aoPrecisarDeConversa: () => Promise<string>;
}) {
  const conversa = useQuery({
    queryKey: chavesAssistente.conversa(conversaId ?? "nenhuma"),
    queryFn: () => api.conversa(conversaId ?? ""),
    enabled: conversaId !== null,
  });
  const resposta = useRespostaAoVivo(api);
  const { erro, enviar, parar } = resposta;
  // Ao trocar de conversa no meio de uma resposta, ela continua, mas aparece só na conversa dela.
  const aoVivo = resposta.aoVivo && resposta.aoVivo.conversaId === conversaId ? resposta.aoVivo : null;
  const mensagens = useMemo(() => conversa.data?.mensagens ?? [], [conversa.data]);
  const perguntar = async (texto: string) => enviar(conversaId ?? (await aoPrecisarDeConversa()), texto);
  const vazia = mensagens.length === 0 && !aoVivo;
  return (
    <section className="chat__principal" aria-label="Conversa">
      {conversa.error ? (
        <ErroCarregar erro={conversa.error} tentarDeNovo={() => void conversa.refetch()} compacto />
      ) : null}
      {conversa.isFetching && !conversa.data && conversaId && !aoVivo ? (
        <Esqueleto linhas={4} rotulo="Carregando a conversa" />
      ) : null}
      {vazia && !conversa.isFetching ? (
        <Sugestoes aoEscolher={(s) => void perguntar(s)} />
      ) : (
        <ListaMensagens mensagens={mensagens} aoVivo={aoVivo} />
      )}
      {erro ? (
        <p className="chat__aviso chat__aviso--erro" role="alert">
          {erro}
        </p>
      ) : null}
      <CaixaPergunta ocupado={resposta.aoVivo !== null} aoEnviar={(t) => void perguntar(t)} aoParar={parar} />
      <p className="chat__nota apagado">
        <ShieldCheck size={13} aria-hidden="true" /> O assistente só lê os seus dados e não envia ordens. Não
        é recomendação de investimento: operar cripto envolve risco de perda, inclusive total.
      </p>
    </section>
  );
}

/** Assistente: conversa com os seus dados (resumo, robôs, decisões, ordens, conhecimento). */
export function Assistente({ api: apiInjetada }: { readonly api?: ApiAssistente } = {}) {
  const api = useMemo(() => apiInjetada ?? criarApiAssistente(), [apiInjetada]);
  const fonte = useFonte();
  const [atual, setAtual] = useState<string | null>(null);
  const { lista, criar, apagar } = useConversas(api);
  const nova = async () => {
    const c = await criar.mutateAsync();
    setAtual(c.id);
    return c.id;
  };
  if (fonte.demo) {
    return (
      <>
        <Cabecalho titulo="Assistente">Converse com os seus dados do ZenTrade.</Cabecalho>
        <EstadoVazio icone={MessagesSquare} titulo="Indisponível no modo de demonstração">
          O assistente precisa da API e do agente de IA rodando. Suba o ZenTrade com Docker para conversar com
          os seus dados.
        </EstadoVazio>
      </>
    );
  }
  return (
    <>
      <Cabecalho
        titulo="Assistente"
        acoes={
          <Link to="/assistente/configuracoes" className="botao botao--secundario">
            <Settings2 size={16} aria-hidden="true" /> Configurações
          </Link>
        }
      >
        Pergunte sobre os seus robôs, decisões e conhecimento. Ele só lê — quem decide continua sendo você e o
        motor de risco.
      </Cabecalho>
      <QuemResponde api={api} />
      <div className="chat">
        <ListaConversas
          conversas={lista.data ?? []}
          atual={atual}
          aoEscolher={setAtual}
          aoNova={() => void nova()}
          aoApagar={(id) => {
            apagar.mutate(id);
            if (id === atual) setAtual(null);
          }}
          criando={criar.isPending}
        />
        <PainelConversa api={api} conversaId={atual} aoPrecisarDeConversa={nova} />
      </div>
    </>
  );
}
