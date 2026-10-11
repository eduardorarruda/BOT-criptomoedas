import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Conversa, MensagemAssistente, MudancaConfigAssistente } from "@zentrade/contratos/esquemas";
import { ArrowDown, PanelLeft, ShieldCheck, SquarePen } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFonte } from "../../api/contexto";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { ErroCarregar, Esqueleto } from "../../componentes/Estados";
import { criarApiAssistente, type ApiAssistente } from "./api";
import "./assistente.css";
import "./mensagens.css";
import { BarraConversas, type PropsBarraConversas } from "./BarraConversas";
import { Saudacao, Sugestoes } from "./Boasvindas";
import { Compositor } from "./Compositor";
import { apiAssistenteDemo } from "./demo";
import { emAndamento } from "./estado";
import { useAlturaDisponivel, useAtalhos, useMidia, useRolagemNoFim } from "./ganchos";
import { GavetaConversas, useBarraLembrada } from "./Gaveta";
import { ListaMensagens } from "./Mensagens";
import { motivoBloqueio, SeletorProvedor } from "./SeletorProvedor";
import { chavesAssistente, useRespostaAoVivo } from "./useRespostaAoVivo";

const NENHUMA: readonly MensagemAssistente[] = [];
const TELA_ESTREITA = "(max-width: 900px)";
const LARGURA_BARRA = 280;
const ATALHO =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl ";

function useConversas(api: ApiAssistente) {
  const qc = useQueryClient();
  const avisar = useAvisos();
  const atualizarLista = () => void qc.invalidateQueries({ queryKey: chavesAssistente.conversas });
  const lista = useQuery({ queryKey: chavesAssistente.conversas, queryFn: () => api.conversas() });
  const criar = useMutation({
    mutationFn: () => api.criarConversa(),
    onSuccess: (c) => {
      qc.setQueryData<Conversa>(chavesAssistente.conversa(c.id), { ...c, mensagens: [] });
      atualizarLista();
    },
    onError: (e) => avisar("erro", mensagemDe(e)),
  });
  const renomear = useMutation({
    mutationFn: ({ id, titulo }: { id: string; titulo: string }) => api.renomear(id, titulo),
    onSuccess: (c) => {
      qc.setQueryData<Conversa>(chavesAssistente.conversa(c.id), (antes) =>
        antes ? { ...antes, titulo: c.titulo } : antes,
      );
      atualizarLista();
    },
    onError: (e) => avisar("erro", mensagemDe(e)),
  });
  const apagar = useMutation({
    mutationFn: (id: string) => api.apagar(id),
    onSuccess: atualizarLista,
    onError: (e) => avisar("erro", mensagemDe(e)),
  });
  return { lista, criar, renomear, apagar };
}

function useConfig(api: ApiAssistente) {
  const qc = useQueryClient();
  const avisar = useAvisos();
  const estado = useQuery({ queryKey: chavesAssistente.estado, queryFn: () => api.estado() });
  const mudar = useMutation({
    mutationFn: (m: MudancaConfigAssistente) => api.mudarConfig(m),
    onSuccess: (novo) => qc.setQueryData(chavesAssistente.estado, novo),
    onError: (e) => avisar("erro", mensagemDe(e)),
  });
  return { estado, mudar };
}

/** Pede foco num elemento depois do próximo desenho (quando ele já existe na tela). */
function useFocarDepois() {
  const [pedido, setPedido] = useState<{ el: () => HTMLElement | null } | null>(null);
  useEffect(() => {
    pedido?.el()?.focus();
  }, [pedido]);
  return useCallback((el: () => HTMLElement | null) => setPedido({ el }), []);
}

interface Props {
  readonly api?: ApiAssistente;
  readonly conversaInicial?: string | null;
  readonly aoTrocarConversa?: (id: string | null) => void;
}

/** Assistente: conversa com os seus dados, no formato de um app de chat (barra de conversas, mensagens e caixa). */
export function Assistente({ api: apiInjetada, conversaInicial = null, aoTrocarConversa }: Props = {}) {
  const fonte = useFonte();
  const api = useMemo(
    () => apiInjetada ?? (fonte.demo ? apiAssistenteDemo() : criarApiAssistente()),
    [apiInjetada, fonte.demo],
  );
  const [atual, setAtual] = useState<string | null>(conversaInicial);
  // O endereço mudou por fora (voltar do navegador, link): a conversa aberta acompanha.
  const [inicialAnterior, setInicialAnterior] = useState(conversaInicial);
  if (conversaInicial !== inicialAnterior) {
    setInicialAnterior(conversaInicial);
    setAtual(conversaInicial);
  }
  const estreita = useMidia(TELA_ESTREITA);
  const [barraAberta, setBarraAberta] = useBarraLembrada();
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const entradaRef = useRef<HTMLTextAreaElement>(null);
  const focar = useFocarDepois();
  useAlturaDisponivel(chatRef);

  const { estado, mudar } = useConfig(api);
  const { lista, criar, renomear, apagar } = useConversas(api);
  const conversa = useQuery({
    queryKey: chavesAssistente.conversa(atual ?? "nenhuma"),
    queryFn: () => api.conversa(atual ?? ""),
    enabled: atual !== null,
  });
  const resposta = useRespostaAoVivo(api);
  const aoVivo = resposta.aoVivo?.conversaId === atual ? resposta.aoVivo : null;
  // Só a conversa aberta conta: a resposta de outra continua chegando sem travar esta.
  const andando = aoVivo !== null && emAndamento(aoVivo);
  const mensagens = conversa.data?.mensagens ?? NENHUMA;
  const vazia = atual === null || (conversa.isSuccess && mensagens.length === 0 && !aoVivo);
  const bloqueio = motivoBloqueio(estado.data);
  const { rolagemRef, noFim, aoRolar, irParaOFim } = useRolagemNoFim(
    `${atual}:${mensagens.length}:${aoVivo?.texto.length ?? 0}:${aoVivo?.etapas.length ?? 0}:${aoVivo?.situacao ?? ""}`,
  );

  const trocar = useCallback(
    (id: string | null) => {
      setAtual(id);
      aoTrocarConversa?.(id);
      setGavetaAberta(false);
    },
    [aoTrocarConversa],
  );
  // Ao abrir uma conversa, ela começa no fim (a última resposta), como num app de chat.
  useEffect(() => {
    if (atual) irParaOFim(false);
  }, [atual, irParaOFim]);

  const perguntar = async (texto: string) => {
    let id = atual;
    if (!id) {
      try {
        id = (await criar.mutateAsync()).id;
      } catch {
        return; // o aviso de erro já apareceu
      }
      trocar(id);
    }
    irParaOFim(false);
    void resposta.enviar(id, texto);
  };
  const ultimaPergunta = [...mensagens].reverse().find((msg) => msg.papel === "usuario");
  const novaConversa = () => {
    trocar(null);
    focar(() => entradaRef.current);
  };
  const mostrarBarra = () => (estreita ? setGavetaAberta(true) : setBarraAberta(true));

  useAtalhos({
    buscar: () => {
      mostrarBarra();
      focar(() => buscaRef.current);
    },
    novaConversa,
    parar: () => {
      if (andando) resposta.parar();
    },
  });

  const barra: PropsBarraConversas = {
    conversas: lista.data ?? [],
    carregando: lista.isPending,
    erro: lista.error,
    aoTentarDeNovo: () => void lista.refetch(),
    atual,
    aoEscolher: trocar,
    aoNova: novaConversa,
    aoRenomear: (id, titulo) => renomear.mutate({ id, titulo }),
    aoApagar: (id) => {
      apagar.mutate(id);
      if (id === atual) novaConversa();
    },
    apagando: apagar.isPending,
    aoFechar: () => (estreita ? setGavetaAberta(false) : setBarraAberta(false)),
    gaveta: estreita,
    atalho: ATALHO,
  };
  const barraVisivel = !estreita && barraAberta;
  const titulo = atual
    ? (conversa.data?.titulo ?? lista.data?.find((c) => c.id === atual)?.titulo ?? "Conversa")
    : "Assistente";

  return (
    <div className="chat" ref={chatRef}>
      <AnimatePresence initial={false}>
        {barraVisivel ? (
          <m.div
            key="barra"
            className="chat__barra"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: LARGURA_BARRA, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <BarraConversas {...barra} buscaRef={buscaRef} />
          </m.div>
        ) : null}
      </AnimatePresence>
      {estreita ? (
        <GavetaConversas aberta={gavetaAberta} aoFechar={() => setGavetaAberta(false)}>
          <BarraConversas {...barra} buscaRef={buscaRef} />
        </GavetaConversas>
      ) : null}

      <section
        className={`chat__principal ${vazia ? "chat__principal--vazia" : ""}`}
        aria-labelledby="titulo-conversa"
      >
        <header className="chat__topo">
          {barraVisivel ? null : (
            <>
              <button
                type="button"
                className="botao-icone"
                onClick={mostrarBarra}
                aria-label="Mostrar as conversas"
                title="Conversas"
              >
                <PanelLeft size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="botao-icone"
                onClick={novaConversa}
                aria-label="Nova conversa"
                title="Nova conversa"
              >
                <SquarePen size={17} aria-hidden="true" />
              </button>
            </>
          )}
          <h1 id="titulo-conversa" className="chat__titulo">
            {titulo}
          </h1>
        </header>

        <div className="chat__rolagem" ref={rolagemRef} onScroll={aoRolar}>
          <div className="chat__coluna">
            {vazia ? <Saudacao /> : null}
            {conversa.error ? (
              <ErroCarregar erro={conversa.error} tentarDeNovo={() => void conversa.refetch()} compacto />
            ) : null}
            {atual && conversa.isPending && !aoVivo ? (
              <Esqueleto linhas={4} rotulo="Carregando a conversa" />
            ) : null}
            {!vazia && (conversa.isSuccess || aoVivo) ? (
              <ListaMensagens
                key={atual}
                mensagens={mensagens}
                aoVivo={aoVivo}
                aoRegenerar={
                  ultimaPergunta && !andando && !bloqueio ? () => void perguntar(ultimaPergunta.texto) : null
                }
                aoTentarDeNovo={(p) => void perguntar(p)}
              />
            ) : null}
          </div>
        </div>

        <div className="chat__base">
          {!vazia && !noFim ? (
            <button type="button" className="chat__ir-fim" onClick={() => irParaOFim()}>
              <ArrowDown size={14} aria-hidden="true" /> Ir para o fim
            </button>
          ) : null}
          <div className="chat__coluna">
            <Compositor
              entradaRef={entradaRef}
              emAndamento={andando}
              bloqueio={bloqueio}
              aoEnviar={(t) => void perguntar(t)}
              aoParar={resposta.parar}
              rodape={
                <SeletorProvedor
                  estado={estado.data}
                  salvando={mudar.isPending}
                  aoMudar={(m) => mudar.mutate(m)}
                />
              }
            />
            {vazia ? (
              <Sugestoes aoEscolher={(t) => void perguntar(t)} desligadas={bloqueio !== null || andando} />
            ) : null}
            <p className="chat__nota">
              <ShieldCheck size={13} aria-hidden="true" /> O assistente só lê os seus dados e não envia
              ordens. Não é recomendação de investimento: operar cripto envolve risco de perda, inclusive
              total.
            </p>
          </div>
        </div>
      </section>
      <p className="so-leitor" role="status">
        {resposta.anuncio}
      </p>
    </div>
  );
}
