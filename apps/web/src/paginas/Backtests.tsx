import { History } from "lucide-react";
import { useState } from "react";
import { Cabecalho, Painel } from "../componentes/Cabecalho";
import { Dinheiro } from "../componentes/Dinheiro";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { ProximoPasso } from "../componentes/ProximoPasso";
import { Selo } from "../componentes/Selo";
import { useBacktests, useEstrategias } from "../ganchos/consultas";
import { FormBacktest } from "./backtests/FormBacktest";
import { ResultadoBacktest } from "./backtests/ResultadoBacktest";

const ESTADO = {
  na_fila: { texto: "Na fila", tom: "neutro" },
  rodando: { texto: "Rodando…", tom: "atencao" },
  concluido: { texto: "Concluído", tom: "marca" },
  falhou: { texto: "Falhou", tom: "perda" },
} as const;

export function Backtests() {
  const consulta = useBacktests();
  const consultaEstrategias = useEstrategias();
  const estrategias = consultaEstrategias.data ?? [];
  const semEstrategia = consultaEstrategias.isSuccess && estrategias.length === 0;
  const [aberto, setAberto] = useState<string | null>(null);
  const lista = consulta.data ?? [];
  const selecionado = lista.find((b) => b.id === aberto) ?? lista.find((b) => b.estado === "concluido");
  const nome = (id?: string) => estrategias.find((e) => e.id === id)?.nome ?? "Estratégia";

  return (
    <>
      <Cabecalho titulo="Backtests">
        Teste uma estratégia em dados passados, com taxas, deslizamento e os limites do robô, e veja se o
        resultado resiste fora da amostra. É simulação: sempre marcada como tal.
      </Cabecalho>
      {semEstrategia ? (
        <EstadoVazio icone={History} titulo="Nada para testar ainda" acao={<ProximoPasso />}>
          O backtest roda uma estratégia em candles passados. Crie a primeira a partir de um modelo e volte
          aqui para ver o veredito.
        </EstadoVazio>
      ) : (
        <Painel titulo="Novo backtest" id="titulo-novo-backtest">
          <FormBacktest />
        </Painel>
      )}
      {consulta.isPending ? <Esqueleto altura={320} rotulo="Carregando backtests" /> : null}
      {consulta.error ? (
        <ErroCarregar erro={consulta.error} tentarDeNovo={() => void consulta.refetch()} />
      ) : null}
      {consulta.isSuccess && lista.length === 0 && !semEstrategia ? (
        <EstadoVazio icone={History} titulo="Nenhum backtest ainda">
          Escolha uma estratégia acima e rode o primeiro. Ele usa candles passados e desconta taxas e
          deslizamento.
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
                  {b.metricas ? <Dinheiro valor={b.metricas.resultadoLiquido} sinal colorir /> : null}
                  {b.estado === "concluido" && !b.configuracao ? (
                    <span className="apagado backtests__antigo">antigo, sem validação</span>
                  ) : null}
                  {b.tentativas ? (
                    <span className="apagado backtests__antigo">
                      {b.tentativas.total} {b.tentativas.total === 1 ? "tentativa" : "tentativas"}
                    </span>
                  ) : null}
                  {b.estado === "falhou" && b.erro ? <span className="perda">{b.erro}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {selecionado ? <ResultadoBacktest b={selecionado} nome={nome(selecionado.estrategiaId)} /> : null}
        </div>
      ) : null}
    </>
  );
}
