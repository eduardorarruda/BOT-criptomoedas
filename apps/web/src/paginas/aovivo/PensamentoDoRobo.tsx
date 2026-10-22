import type { PensamentoHistoricoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { Brain, CircleSlash, Sparkles } from "lucide-react";
import { Painel } from "../../componentes/Cabecalho";
import { ListaCondicoes } from "../../componentes/cenario/ListaCondicoes";
import { NumerosDoCenario, ReguaDaMedia, SeloCenario } from "../../componentes/cenario/Cenario";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { Selo } from "../../componentes/Selo";
import { useHistoricoDoPensamento, usePensamentos } from "../../ganchos/consultas";
import { CENARIO, resumoDoRobo } from "../../lib/cenario";
import { formatarDataHora, formatarRelativo } from "../../lib/tempo";
import "../../componentes/cenario/cenario.css";

const TITULO_REGRA = {
  entrada: "Regra de entrada, condição por condição",
  saida: "Regra de saída, condição por condição",
  nenhuma: "",
} as const;

const MOTIVO: Record<PensamentoHistoricoDTO["motivo"], string> = {
  inicio: "Primeira leitura",
  cenario: "O cenário mudou",
  sinal: "A regra deu sinal",
};

/** Linha do tempo curta: primeira leitura, mudanças de cenário e sinais (não cada vela). */
function LinhaDasLeituras({ roboId }: { readonly roboId: string }) {
  const historico = useHistoricoDoPensamento(roboId);
  if (historico.isPending) return <Esqueleto forma="lista" linhas={3} rotulo="Carregando as leituras" />;
  if (historico.error)
    return <ErroCarregar erro={historico.error} tentarDeNovo={() => void historico.refetch()} compacto />;
  if (historico.data.length === 0) return <p className="por-dentro__nota--apagada">Nenhuma mudança ainda.</p>;
  return (
    <ol
      className="pensamento__linha"
      aria-label="Mudanças de cenário e sinais, da mais recente para a mais antiga"
    >
      {historico.data.slice(0, 12).map((h) => {
        const c = CENARIO[h.pensamento.cenario.cenario];
        return (
          <li key={`${h.pensamento.em}-${h.motivo}`} className={`tom-${c.tom}`}>
            <span>
              <strong>{MOTIVO[h.motivo]}</strong> · <SeloCenario cenario={h.pensamento.cenario.cenario} />
            </span>
            <span>{h.pensamento.conclusao}</span>
            <time className="pensamento__quando" dateTime={new Date(h.pensamento.em).toISOString()}>
              {formatarDataHora(h.pensamento.em)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * "Robô por dentro": o último pensamento (a conclusão, o cenário, cada condição da regra
 * com ✓ ou ✗) e as últimas mudanças. Nada aqui gasta IA: é o que o motor já calculou.
 */
export function PensamentoDoRobo({ robo }: { readonly robo: RoboDTO }) {
  const pensamentos = usePensamentos();
  const atual = pensamentos.data?.find((p) => p.roboId === robo.id)?.pensamento;
  return (
    <Painel
      titulo="Robô por dentro"
      id="titulo-pensamento"
      icone={Brain}
      descricao="O que a estratégia pensou na última vela fechada, mesmo sem dar sinal."
    >
      {pensamentos.isPending ? (
        <Esqueleto forma="lista" linhas={4} rotulo="Carregando o pensamento do robô" />
      ) : null}
      {pensamentos.error ? (
        <ErroCarregar erro={pensamentos.error} tentarDeNovo={() => void pensamentos.refetch()} compacto />
      ) : null}
      {pensamentos.data && !atual ? (
        <EstadoVazio icone={Brain} titulo="Ainda sem pensamento" compacto>
          Ele aparece quando este robô fechar a primeira vela depois de ligado.
        </EstadoVazio>
      ) : null}
      {atual ? (
        <div className="pensamento">
          <div className="pensamento__meta">
            <SeloCenario cenario={atual.cenario.cenario} />
            <Selo tom={resumoDoRobo(atual).tom}>{resumoDoRobo(atual).rotulo}</Selo>
            <Selo tom="neutro" icone={atual.agente === "desligado" ? CircleSlash : Sparkles}>
              {atual.agente === "desligado" ? "Claude desligado" : "Claude confere as entradas"}
            </Selo>
            <time
              className="apagado"
              dateTime={new Date(atual.em).toISOString()}
              title={formatarDataHora(atual.em)}
            >
              {formatarRelativo(atual.em)}
            </time>
          </div>
          <p className="pensamento__conclusao">{atual.conclusao}</p>
          <section aria-labelledby="titulo-cenario-robo" className="pensamento">
            <h3 className="pensamento__sub" id="titulo-cenario-robo">
              Cenário de mercado
            </h3>
            <p className="por-dentro__nota">{atual.cenario.texto}</p>
            <ReguaDaMedia leitura={atual.cenario} />
            <NumerosDoCenario leitura={atual.cenario} />
          </section>
          {atual.condicoes && atual.regraAvaliada !== "nenhuma" ? (
            <section aria-labelledby="titulo-regra-robo" className="pensamento">
              <h3 className="pensamento__sub" id="titulo-regra-robo">
                {TITULO_REGRA[atual.regraAvaliada]}
              </h3>
              <ListaCondicoes condicoes={atual.condicoes} rotulo={TITULO_REGRA[atual.regraAvaliada]} />
            </section>
          ) : null}
          <section aria-labelledby="titulo-leituras-robo" className="pensamento">
            <h3 className="pensamento__sub" id="titulo-leituras-robo">
              Últimas mudanças
            </h3>
            <LinhaDasLeituras roboId={robo.id} />
          </section>
        </div>
      ) : null}
    </Painel>
  );
}
