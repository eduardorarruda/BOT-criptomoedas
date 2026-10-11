import type { DecisaoDTO, Intervalo } from "@zentrade/contratos/esquemas";
import { useCallback, useMemo, useState } from "react";
import type { CoresGrafico } from "../componentes/graficos/cores";
import { Cabecalho, Painel } from "../componentes/Cabecalho";
import { CandlestickChart, ScrollText } from "lucide-react";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { GraficoCandles } from "../componentes/graficos/GraficoCandles";
import { estiloDecisao, marcadores } from "../componentes/graficos/velas";
import { PrecoAoVivo } from "../componentes/PrecoAoVivo";
import { Segmentado } from "../componentes/Segmentado";
import { Selo } from "../componentes/Selo";
import { useCandles, useDecisoes, useRobos } from "../ganchos/consultas";
import { lojaPrecos } from "../ganchos/lojas";
import { useTelaEstreita } from "../ganchos/useTelaEstreita";
import { formatarPreco } from "../lib/formatar";
import { useLoja } from "../lib/loja";
import { ACAO, ESTADO_DECISAO } from "../lib/rotulos";
import { formatarDataHora } from "../lib/tempo";

const SIMBOLOS_PADRAO = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
const INTERVALOS: readonly { valor: Intervalo; rotulo: string }[] = [
  { valor: "1m", rotulo: "1 min" },
  { valor: "5m", rotulo: "5 min" },
  { valor: "15m", rotulo: "15 min" },
  { valor: "1h", rotulo: "1 h" },
  { valor: "4h", rotulo: "4 h" },
  { valor: "1d", rotulo: "1 dia" },
];

const SEM_DECISOES: readonly DecisaoDTO[] = [];

const LEGENDA = [
  { rotulo: "Compra", classe: "legenda--compra" },
  { rotulo: "Venda", classe: "legenda--venda" },
  { rotulo: "Aguarda você", classe: "legenda--aguarda" },
  { rotulo: "Barrada", classe: "legenda--barrada" },
  { rotulo: "Só registro", classe: "legenda--registro" },
];

export function Mercado() {
  const dadosRobos = useRobos().data;
  const robos = dadosRobos ?? [];
  const simbolos = useMemo(() => {
    const dosRobos = [...new Set((dadosRobos ?? []).map((r) => r.simbolo))];
    return dosRobos.length ? dosRobos : SIMBOLOS_PADRAO;
  }, [dadosRobos]);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const simbolo = escolhido ?? simbolos[0] ?? "BTCUSDT";
  const [intervalo, setIntervalo] = useState<Intervalo>("1h");
  const velas = useCandles(simbolo, intervalo);
  const todas = useDecisoes({ limite: 200 }).data ?? SEM_DECISOES;
  const decisoes = useMemo(() => {
    const ids = new Set((dadosRobos ?? []).filter((r) => r.simbolo === simbolo).map((r) => r.id));
    return todas.filter((d) => ids.has(d.roboId));
  }, [todas, dadosRobos, simbolo]);
  const estreita = useTelaEstreita();
  const marcar = useCallback(
    (cores: CoresGrafico, inicio: number) => marcadores(decisoes, intervalo, cores, inicio, estreita),
    [decisoes, intervalo, estreita],
  );
  const precoAoVivo = useLoja(lojaPrecos, (s) => s[simbolo]);
  const ultimaVela = velas.data?.at(-1);
  const rotuloIntervalo = INTERVALOS.find((i) => i.valor === intervalo)?.rotulo ?? intervalo;

  return (
    <>
      <Cabecalho titulo="Mercado">
        Candles do par com cada decisão dos robôs marcada onde aconteceu.
      </Cabecalho>
      <div className="barra-filtros">
        <Segmentado
          rotulo="Par"
          opcoes={simbolos.map((s) => ({ valor: s, rotulo: s.replace("USDT", "/USDT") }))}
          valor={simbolo}
          aoMudar={setEscolhido}
        />
        <Segmentado rotulo="Intervalo" opcoes={INTERVALOS} valor={intervalo} aoMudar={setIntervalo} />
      </div>
      <Painel className="painel--grafico">
        <div className="cotacao">
          <h2 className="cotacao__par">{simbolo.replace("USDT", "/USDT")}</h2>
          <span className="cotacao__preco">
            <PrecoAoVivo simbolo={simbolo} {...(ultimaVela ? { reserva: ultimaVela.fecha } : {})} />
          </span>
        </div>
        {velas.isPending ? <Esqueleto forma="grafico" altura={420} rotulo="Carregando os candles" /> : null}
        {velas.error ? <ErroCarregar erro={velas.error} tentarDeNovo={() => void velas.refetch()} /> : null}
        {velas.data?.length === 0 ? (
          <EstadoVazio
            icone={CandlestickChart}
            titulo={`Ainda não há candles de ${rotuloIntervalo} gravados`}
          >
            O motor grava os candles do intervalo de cada robô e os de 1 min de cada par que ele acompanha.
            Escolha outro intervalo ou crie um robô em {simbolo.replace("USDT", "/USDT")} neste intervalo.
          </EstadoVazio>
        ) : null}
        {velas.data?.length ? (
          <GraficoCandles
            velas={velas.data}
            intervalo={intervalo}
            marcar={marcar}
            precoAoVivo={precoAoVivo}
            rotulo={`Gráfico de candles de ${simbolo} em ${intervalo}: ${velas.data.length} velas, último preço ${formatarPreco(precoAoVivo?.preco ?? ultimaVela?.fecha ?? "")}, ${decisoes.length} decisões marcadas. A tabela abaixo lista as decisões.`}
          />
        ) : null}
        <ul role="list" className="legenda" aria-label="Legenda das marcas">
          {LEGENDA.map((l) => (
            <li key={l.rotulo} className={l.classe}>
              <span aria-hidden="true" />
              {l.rotulo}
            </li>
          ))}
        </ul>
        <p className="legenda__nota">
          Na mesma vela, as marcas se juntam: “Compra ×2” são duas compras; “Barrada +1” é uma barrada e mais
          uma decisão de outro tipo. A tabela abaixo mostra cada uma.
        </p>
      </Painel>
      <Painel titulo="Decisões neste par" id="titulo-decisoes-par" icone={ScrollText}>
        {decisoes.length === 0 ? (
          <p className="apagado">Nenhum robô decidiu nada em {simbolo} ainda.</p>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Robô</th>
                  <th scope="col">Ação</th>
                  <th scope="col">Marca</th>
                  <th scope="col" className="tabela__num">
                    Preço
                  </th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {decisoes.map((d) => {
                  const estado = ESTADO_DECISAO[d.estado];
                  return (
                    <tr key={d.id}>
                      <td className="num">{formatarDataHora(d.em)}</td>
                      <td>{robos.find((r) => r.id === d.roboId)?.nome ?? "—"}</td>
                      <td>{ACAO[d.sinal.acao]}</td>
                      <td>{estiloDecisao(d).rotulo}</td>
                      <td className="tabela__num num">{formatarPreco(d.preco)}</td>
                      <td>
                        <Selo tom={estado.tom} icone={estado.icone}>
                          {estado.texto}
                        </Selo>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Painel>
    </>
  );
}
