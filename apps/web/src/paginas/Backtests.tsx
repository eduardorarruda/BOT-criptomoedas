import type { Intervalo } from "@zentrade/contratos";
import { FlaskConical, History, Play } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Backtest } from "../api/esquemas";
import { mensagemDe } from "../api/erros";
import { useAvisos } from "../componentes/Avisos";
import { Botao } from "../componentes/Botao";
import { Cabecalho, Painel } from "../componentes/Cabecalho";
import { CampoSelecao } from "../componentes/Campo";
import { Dinheiro } from "../componentes/Dinheiro";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { GraficoLinha } from "../componentes/graficos/GraficoLinha";
import { Segmentado } from "../componentes/Segmentado";
import { Selo } from "../componentes/Selo";
import { useBacktests, useEstrategias } from "../ganchos/consultas";
import { useCriarBacktest } from "../ganchos/mutacoes";
import { formatarDinheiro, formatarPercentual } from "../lib/formatar";
import { formatarData } from "../lib/tempo";

const DIA = 86_400_000;
const PERIODOS = [
  { valor: "30", rotulo: "30 dias" },
  { valor: "90", rotulo: "90 dias" },
  { valor: "180", rotulo: "180 dias" },
] as const;
const ESTADO = {
  na_fila: { texto: "Na fila", tom: "neutro" },
  rodando: { texto: "Rodando…", tom: "atencao" },
  concluido: { texto: "Concluído", tom: "marca" },
  falhou: { texto: "Falhou", tom: "perda" },
} as const;

function FormBacktest() {
  const estrategias = useEstrategias().data ?? [];
  const criar = useCriarBacktest();
  const avisar = useAvisos();
  const [estrategiaId, setEstrategiaId] = useState("");
  const [simbolo, setSimbolo] = useState("BTCUSDT");
  const [intervalo, setIntervalo] = useState<Intervalo>("1h");
  const [dias, setDias] = useState<(typeof PERIODOS)[number]["valor"]>("90");
  const escolhida = estrategias.find((e) => e.id === estrategiaId) ?? estrategias[0];

  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    if (!escolhida) return;
    const fim = Date.now();
    criar.mutate(
      {
        estrategiaId: escolhida.id,
        versao: escolhida.versao,
        simbolo,
        intervalo,
        inicio: fim - Number(dias) * DIA,
        fim,
      },
      {
        onSuccess: () => avisar("info", "Backtest na fila. O resultado aparece aqui quando terminar."),
        onError: (er) => avisar("erro", mensagemDe(er)),
      },
    );
  };

  return (
    <form className="formulario formulario--linha" onSubmit={enviar}>
      <CampoSelecao
        rotulo="Estratégia"
        value={escolhida?.id ?? ""}
        onChange={(e) => setEstrategiaId(e.target.value)}
      >
        {estrategias.map((x) => (
          <option key={x.id} value={x.id}>
            {x.nome} (v{x.versao})
          </option>
        ))}
      </CampoSelecao>
      <CampoSelecao rotulo="Par" value={simbolo} onChange={(e) => setSimbolo(e.target.value)}>
        {["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"].map((p) => (
          <option key={p}>{p}</option>
        ))}
      </CampoSelecao>
      <CampoSelecao
        rotulo="Intervalo"
        value={intervalo}
        onChange={(e) => setIntervalo(e.target.value as Intervalo)}
      >
        {(["15m", "1h", "4h", "1d"] as const).map((i) => (
          <option key={i}>{i}</option>
        ))}
      </CampoSelecao>
      <Segmentado rotulo="Período" opcoes={PERIODOS} valor={dias} aoMudar={setDias} />
      <Botao
        type="submit"
        variante="primario"
        icone={Play}
        carregando={criar.isPending}
        disabled={!escolhida}
      >
        Rodar backtest
      </Botao>
    </form>
  );
}

function Resultado({ b, nome }: { readonly b: Backtest; readonly nome: string }) {
  const m = b.metricas;
  if (!m || !b.curva) return null;
  const acerto = m.operacoes ? m.acertos / m.operacoes : 0;
  return (
    <section className="simulacao" aria-labelledby={`sim-${b.id}`}>
      <p className="simulacao__selo">
        <FlaskConical size={14} aria-hidden="true" /> Simulação com dados passados · não é dinheiro real
      </p>
      <h2 id={`sim-${b.id}`} className="simulacao__titulo">
        {nome} v{b.versao} · {b.simbolo} {b.intervalo} · {b.inicio ? formatarData(b.inicio) : ""} a{" "}
        {b.fim ? formatarData(b.fim) : ""}
      </h2>
      <dl className="metricas metricas--simulacao">
        <div className="metrica">
          <dt>Resultado simulado</dt>
          <dd>
            <Dinheiro valor={m.resultado} sinal colorir />
          </dd>
          <p className="metrica__nota num">
            {formatarPercentual(m.resultadoPercentual, { sinal: true })} sobre{" "}
            {formatarDinheiro(b.capitalInicial ?? "1000")}
          </p>
        </div>
        <div className="metrica">
          <dt>Maior queda</dt>
          <dd>
            <Dinheiro valor={m.maiorQueda} colorir />
          </dd>
        </div>
        <div className="metrica">
          <dt>Taxas simuladas</dt>
          <dd className="num perda">{formatarDinheiro(m.taxas)}</dd>
        </div>
        <div className="metrica">
          <dt>Operações</dt>
          <dd className="num">{m.operacoes}</dd>
          <p className="metrica__nota">
            <span className="num">{formatarPercentual(acerto, { casas: 0 })}</span> terminaram no lucro
          </p>
        </div>
      </dl>
      <GraficoLinha
        pontos={b.curva}
        tipo="backtest"
        rotulo={`Curva simulada do backtest de ${nome}: resultado ${formatarDinheiro(m.resultado, { sinal: true })}, maior queda ${formatarDinheiro(m.maiorQueda)}.`}
      />
      <p className="simulacao__aviso">
        Resultado passado, mesmo simulado com taxas, não garante resultado futuro. O mercado real tem atrasos
        e escorregões que o backtest não captura por inteiro.
      </p>
    </section>
  );
}

export function Backtests() {
  const consulta = useBacktests();
  const estrategias = useEstrategias().data ?? [];
  const [aberto, setAberto] = useState<string | null>(null);
  const lista = consulta.data ?? [];
  const selecionado = lista.find((b) => b.id === aberto) ?? lista.find((b) => b.estado === "concluido");
  const nome = (id?: string) => estrategias.find((e) => e.id === id)?.nome ?? "Estratégia";

  return (
    <>
      <Cabecalho titulo="Backtests">
        Teste uma estratégia em dados passados, com taxas. É simulação: sempre marcada como tal.
      </Cabecalho>
      <Painel titulo="Novo backtest" id="titulo-novo-backtest">
        <FormBacktest />
      </Painel>
      {consulta.isPending ? <Esqueleto altura={320} rotulo="Carregando backtests" /> : null}
      {consulta.error ? (
        <ErroCarregar erro={consulta.error} tentarDeNovo={() => void consulta.refetch()} />
      ) : null}
      {consulta.isSuccess && lista.length === 0 ? (
        <EstadoVazio icone={History} titulo="Nenhum backtest ainda">
          Escolha uma estratégia acima e rode o primeiro. Ele usa candles passados e desconta as taxas.
        </EstadoVazio>
      ) : null}
      {lista.length ? (
        <div className="backtests">
          <ul role="list" className="backtests__lista" aria-label="Backtests">
            {lista.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="backtests__item"
                  aria-current={selecionado?.id === b.id ? "true" : undefined}
                  disabled={b.estado !== "concluido"}
                  onClick={() => setAberto(b.id)}
                >
                  <span>
                    {nome(b.estrategiaId)} <span className="num apagado">v{b.versao}</span>
                  </span>
                  <span className="apagado">
                    {b.simbolo} · {b.intervalo}
                  </span>
                  <Selo tom={ESTADO[b.estado].tom}>{ESTADO[b.estado].texto}</Selo>
                  {b.metricas ? <Dinheiro valor={b.metricas.resultado} sinal colorir /> : null}
                </button>
              </li>
            ))}
          </ul>
          {selecionado ? <Resultado b={selecionado} nome={nome(selecionado.estrategiaId)} /> : null}
        </div>
      ) : null}
    </>
  );
}
