import type { EventoMercadoDTO, NovoEventoMercadoDTO } from "@zentrade/contratos/esquemas";
import { NovoEventoMercadoEsquema } from "@zentrade/contratos/esquemas";
import { CalendarClock, CircleCheck, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { Painel } from "../../componentes/Cabecalho";
import { CampoSelecao, CampoTexto } from "../../componentes/Campo";
import { Confirmar } from "../../componentes/Confirmar";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { Selo } from "../../componentes/Selo";
import { nomeDoFusoDaInstancia } from "../../lib/fuso";
import {
  useConfirmarEvento,
  useCriarEvento,
  useEventosAgenda,
  useRemoverEvento,
  useSugerirEventos,
} from "./agenda-ganchos";

const MERCADO = { win: "Mini índice (WIN)", cripto: "Cripto", todos: "Todos os mercados" } as const;
const IMPACTO = { alto: "Alto impacto", medio: "Médio impacto" } as const;

const formatoDia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
/** "2026-10-28" → "qua., 28/10" (a data do evento é um dia do calendário, sem fuso). */
const rotuloDoDia = (data: string): string => formatoDia.format(new Date(`${data}T12:00:00Z`));

const horarioDe = (e: Pick<EventoMercadoDTO, "de" | "ate">): string =>
  e.de && e.ate ? `Só das ${e.de} às ${e.ate}` : "O dia todo";

function ItemEvento({
  e,
  aoConfirmar,
  aoRemover,
}: {
  readonly e: EventoMercadoDTO;
  readonly aoConfirmar: (e: EventoMercadoDTO) => void;
  readonly aoRemover: (e: EventoMercadoDTO) => void;
}) {
  return (
    <li className="pausa">
      <div className="pausa__topo">
        <strong>{rotuloDoDia(e.data)}</strong>
        <span>{e.titulo}</span>
        <Selo tom={e.impacto === "alto" ? "atencao" : "neutro"}>{IMPACTO[e.impacto]}</Selo>
        <Selo tom="info">{MERCADO[e.mercado]}</Selo>
        {e.origem === "sugerido" ? (
          <Selo tom="marca" icone={Sparkles}>
            Sugerido pelo Claude
          </Selo>
        ) : null}
      </div>
      <p className="apagado">
        {horarioDe(e)} ({nomeDoFusoDaInstancia()}).
        {e.origem === "sugerido" ? " Confira a data antes de confirmar: o Claude pode errar." : ""}
      </p>
      <div className="agenda__acoes">
        {e.origem === "sugerido" ? (
          <Botao pequeno variante="secundario" icone={CircleCheck} onClick={() => aoConfirmar(e)}>
            Confirmar <span className="so-leitor">{e.titulo}</span>
          </Botao>
        ) : null}
        <Botao pequeno variante="fantasma" icone={Trash2} onClick={() => aoRemover(e)}>
          Remover <span className="so-leitor">{e.titulo}</span>
        </Botao>
      </div>
    </li>
  );
}

function FormEvento() {
  const criar = useCriarEvento();
  const avisar = useAvisos();
  const [data, setData] = useState("");
  const [titulo, setTitulo] = useState("");
  const [mercado, setMercado] = useState<NovoEventoMercadoDTO["mercado"]>("win");
  const [impacto, setImpacto] = useState<NovoEventoMercadoDTO["impacto"]>("alto");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});

  const enviar = (ev: FormEvent): void => {
    ev.preventDefault();
    const lido = NovoEventoMercadoEsquema.safeParse({
      data,
      mercado,
      titulo,
      impacto,
      ...(de || ate ? { de, ate } : {}),
    });
    if (!lido.success) {
      const porCampo: Record<string, string> = {};
      for (const i of lido.error.issues) porCampo[String(i.path[0] ?? "titulo")] ??= i.message;
      setErros(porCampo);
      return;
    }
    setErros({});
    criar.mutate(lido.data, {
      onSuccess: () => {
        avisar("sucesso", `Evento "${lido.data.titulo}" cadastrado.`);
        setTitulo("");
        setData("");
        setDe("");
        setAte("");
      },
      onError: (er) => avisar("erro", mensagemDe(er)),
    });
  };

  return (
    <form className="formulario formulario--linha" onSubmit={enviar} noValidate aria-label="Cadastrar evento">
      <CampoTexto
        rotulo="Dia do evento"
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        erro={erros.data ?? null}
      />
      <CampoTexto
        rotulo="Título"
        placeholder="Ex.: Copom — decisão da Selic"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        erro={erros.titulo ?? null}
      />
      <CampoSelecao
        rotulo="Mercado"
        value={mercado}
        onChange={(e) => setMercado(e.target.value as typeof mercado)}
      >
        {Object.entries(MERCADO).map(([valor, texto]) => (
          <option key={valor} value={valor}>
            {texto}
          </option>
        ))}
      </CampoSelecao>
      <CampoSelecao
        rotulo="Impacto"
        value={impacto}
        onChange={(e) => setImpacto(e.target.value as typeof impacto)}
        dica="Só eventos de alto impacto acionam o filtro dos robôs."
      >
        {Object.entries(IMPACTO).map(([valor, texto]) => (
          <option key={valor} value={valor}>
            {texto}
          </option>
        ))}
      </CampoSelecao>
      <CampoTexto
        rotulo="A partir de (opcional)"
        type="time"
        value={de}
        onChange={(e) => setDe(e.target.value)}
        dica="Vazio = o dia todo."
      />
      <CampoTexto
        rotulo="Até (opcional)"
        type="time"
        value={ate}
        onChange={(e) => setAte(e.target.value)}
        erro={erros.ate ?? null}
      />
      <Botao type="submit" icone={Plus} carregando={criar.isPending}>
        Cadastrar evento
      </Botao>
    </form>
  );
}

/**
 * Agenda de eventos de mercado: Copom, payroll, eleição… Os robôs e os backtests que
 * ligaram o filtro de "dias de evento" leem esta lista. O filtro nasce desligado: nos
 * pregões medidos, tirar esses dias piorou as estratégias de tendência.
 */
export function PainelAgenda() {
  const eventos = useEventosAgenda();
  const confirmar = useConfirmarEvento();
  const remover = useRemoverEvento();
  const sugerir = useSugerirEventos();
  const avisar = useAvisos();
  const [removendo, setRemovendo] = useState<EventoMercadoDTO | null>(null);

  const pedirSugestao = (): void =>
    sugerir.mutate(undefined, {
      onSuccess: (r) =>
        avisar(
          r.criados.length > 0 ? "sucesso" : "info",
          r.criados.length > 0
            ? `O Claude sugeriu ${r.criados.length} evento(s). Confira as datas e confirme ou remova.`
            : "O Claude não sugeriu nada novo para os próximos 7 dias.",
        ),
      onError: (er) => avisar("erro", mensagemDe(er)),
    });

  return (
    <Painel
      titulo="Agenda de eventos"
      id="titulo-agenda"
      icone={CalendarClock}
      descricao="Dias de Copom, payroll, eleição e dados dos EUA. Cada robô escolhe se bloqueia entradas, reduz o tamanho ou ignora esses dias (padrão: ignorar). Nos 20 pregões do WIN que medimos, tirar os dias de evento piorou as estratégias de tendência, que ganham justamente nesses dias."
      acoes={
        <Botao pequeno icone={Sparkles} carregando={sugerir.isPending} onClick={pedirSugestao}>
          Sugerir eventos da semana
        </Botao>
      }
    >
      <p className="apagado">
        &quot;Sugerir&quot; pede ao Claude os eventos dos próximos 7 dias do calendário oficial. Ele pode
        errar datas: as sugestões entram marcadas e você confirma ou remove. Usa o orçamento de IA.
      </p>
      <FormEvento />
      {eventos.isPending ? (
        <Esqueleto altura={120} rotulo="Carregando a agenda de eventos" />
      ) : eventos.error ? (
        <ErroCarregar erro={eventos.error} tentarDeNovo={() => void eventos.refetch()} />
      ) : eventos.data.length === 0 ? (
        <EstadoVazio compacto icone={CalendarClock} titulo="Nenhum evento nos próximos 90 dias">
          Cadastre um evento acima ou peça sugestões ao Claude.
        </EstadoVazio>
      ) : (
        <ul role="list" className="pausas">
          {eventos.data.map((e) => (
            <ItemEvento
              key={e.id}
              e={e}
              aoRemover={setRemovendo}
              aoConfirmar={(x) =>
                confirmar.mutate(x.id, {
                  onSuccess: () => avisar("sucesso", `"${x.titulo}" confirmado.`),
                  onError: (er) => avisar("erro", mensagemDe(er)),
                })
              }
            />
          ))}
        </ul>
      )}
      <Confirmar
        aberto={removendo !== null}
        titulo="Remover este evento da agenda?"
        rotuloConfirmar="Remover evento"
        carregando={remover.isPending}
        aoCancelar={() => setRemovendo(null)}
        aoConfirmar={() => {
          if (!removendo) return;
          remover.mutate(removendo.id, {
            onSuccess: () => {
              avisar("sucesso", `"${removendo.titulo}" removido da agenda.`);
              setRemovendo(null);
            },
            onError: (er) => avisar("erro", mensagemDe(er)),
          });
        }}
      >
        {removendo ? `${removendo.titulo}, ${rotuloDoDia(removendo.data)}. ` : ""}
        Os robôs e os próximos backtests deixam de tratar esse dia como evento.
      </Confirmar>
    </Painel>
  );
}
