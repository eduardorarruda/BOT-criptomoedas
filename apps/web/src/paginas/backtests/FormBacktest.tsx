import {
  INTERVALOS_WIN,
  SIMBOLO_WIN,
  SIMBOLO_WIN_IBOV,
  type CoberturaWin,
  type EstrategiaDTO,
  type Intervalo,
} from "@zentrade/contratos/esquemas";
import { direcaoDe } from "@zentrade/dominio";
import { Play, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useFonte } from "../../api/contexto";
import { mensagemDe } from "../../api/erros";
import type { PedidoBacktest } from "../../api/fonte";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { CampoSelecao } from "../../componentes/Campo";
import { Segmentado } from "../../componentes/Segmentado";
import { useDadosWin, useEstrategias, useRobos } from "../../ganchos/consultas";
import { useCriarBacktest } from "../../ganchos/mutacoes";
import { formatarData } from "../../lib/tempo";
import {
  AVANCADO_INICIAL,
  CamposAvancados,
  configuracaoDoFormulario,
  lerBps,
  validacaoDoFormulario,
  type Avancado,
} from "./CamposCripto";
import { AtualizarWin } from "./AtualizarWin";
import { criarApiImportacaoB3 } from "./apiB3";
import { CamposDoWin, SemDadosWin, TEXTO_APROXIMACAO } from "./CamposWin";
import { CAMPOS_WIN_INICIAIS, configuracaoWinDoFormulario, errosWin, janelaWin } from "./formularioWin";

export { configuracaoDoFormulario, lerBps } from "./CamposCripto";

const DIA = 86_400_000;
const PERIODOS = [
  { valor: "30", rotulo: "30 dias" },
  { valor: "90", rotulo: "90 dias" },
  { valor: "180", rotulo: "180 dias" },
  { valor: "365", rotulo: "1 ano" },
  { valor: "730", rotulo: "2 anos" },
] as const;
type Periodo = (typeof PERIODOS)[number]["valor"];

/** "cripto" ou o símbolo do mini índice escolhido (WIN de verdade ou a aproximação). */
type Mercado = "cripto" | CoberturaWin["simbolo"];

const vende = (e: EstrategiaDTO | undefined) => e !== undefined && direcaoDe(e) !== "comprado";

function OpcoesMercado({ comIbov }: { readonly comIbov: boolean }) {
  return (
    <>
      <option value="cripto">Cripto (Binance)</option>
      <option value={SIMBOLO_WIN}>Mini índice — WIN (dados reais importados)</option>
      {comIbov ? (
        <option value={SIMBOLO_WIN_IBOV}>Mini índice — WIN (aproximação pelo Ibovespa)</option>
      ) : null}
    </>
  );
}

/** O período que o WIN vai testar e o que há de dados, em uma linha. */
function JanelaDoWin({ janela }: { readonly janela: NonNullable<ReturnType<typeof janelaWin>> }) {
  return (
    <p className="bt-nota">
      Testa de {formatarData(janela.inicio)} a {formatarData(janela.fim)}. Dados gravados:{" "}
      {janela.dados.candles.toLocaleString("pt-BR")} candles, de {formatarData(janela.dados.primeiro)} a{" "}
      {formatarData(janela.dados.ultimo)}.
    </p>
  );
}

export function FormBacktest() {
  const fonte = useFonte();
  const apiImportacao = useMemo(() => criarApiImportacaoB3(), []);
  const estrategias = useEstrategias().data ?? [];
  const robos = useRobos().data ?? [];
  const dadosWin = useDadosWin();
  const cobertura = dadosWin.data ?? [];
  const criar = useCriarBacktest();
  const avisar = useAvisos();
  const [estrategiaId, setEstrategiaId] = useState("");
  const [mercado, setMercado] = useState<Mercado>("cripto");
  const [simbolo, setSimbolo] = useState("BTCUSDT");
  const [intervalo, setIntervalo] = useState<Intervalo>("1h");
  const [dias, setDias] = useState<Periodo>("365");
  const [avancado, setAvancado] = useState(AVANCADO_INICIAL);
  const [camposWin, setCamposWin] = useState(CAMPOS_WIN_INICIAIS);
  const escolhida = estrategias.find((e) => e.id === estrategiaId) ?? estrategias[0];
  const ehWin = mercado !== "cripto";
  const intervaloWin = (INTERVALOS_WIN as readonly string[]).includes(intervalo) ? intervalo : "5m";
  const janela = ehWin
    ? janelaWin(cobertura, mercado, intervaloWin as CoberturaWin["intervalo"], Number(dias))
    : null;
  const erros = errosWin(camposWin);
  const vendeNoCripto = !ehWin && vende(escolhida);
  const valido = ehWin
    ? janela !== null && Object.keys(erros).length === 0
    : lerBps(avancado.deslizamento) !== null && lerBps(avancado.meioSpread) !== null && !vendeNoCripto;
  const mudarAvancado = (p: Partial<Avancado>) => setAvancado((atual) => ({ ...atual, ...p }));

  const pedido = (e: EstrategiaDTO): PedidoBacktest | null => {
    if (ehWin) {
      if (!janela) return null;
      const configuracao = configuracaoWinDoFormulario(
        camposWin,
        validacaoDoFormulario(avancado),
        avancado.execucao,
      );
      const { inicio, fim } = janela;
      return {
        estrategiaId: e.id,
        versao: e.versao,
        simbolo: mercado,
        intervalo: intervaloWin,
        inicio,
        fim,
        configuracao,
      };
    }
    const fim = Date.now();
    const configuracao = configuracaoDoFormulario(avancado, Number(dias), robos);
    return {
      estrategiaId: e.id,
      versao: e.versao,
      simbolo,
      intervalo,
      inicio: fim - Number(dias) * DIA,
      fim,
      configuracao,
    };
  };

  const enviar = (ev: FormEvent): void => {
    ev.preventDefault();
    const p = escolhida && valido ? pedido(escolhida) : null;
    if (!p) return;
    criar.mutate(p, {
      onSuccess: () => avisar("info", "Backtest na fila. O resultado aparece aqui quando terminar."),
      onError: (er) => avisar("erro", mensagemDe(er)),
    });
  };

  const trocarMercado = (m: Mercado) => {
    setMercado(m);
    setIntervalo(m === "cripto" ? "1h" : "5m");
    setDias(m === "cripto" ? "365" : "90");
  };

  return (
    <form className="bt-form" onSubmit={enviar}>
      <div className="formulario formulario--linha">
        <CampoSelecao
          rotulo="Mercado"
          value={mercado}
          onChange={(e) => trocarMercado(e.target.value as Mercado)}
        >
          <OpcoesMercado comIbov={cobertura.some((c) => c.simbolo === SIMBOLO_WIN_IBOV)} />
        </CampoSelecao>
        <CampoSelecao
          rotulo="Estratégia"
          value={escolhida?.id ?? ""}
          erro={vendeNoCripto ? "Esta estratégia vende a descoberto: só roda no mini índice." : undefined}
          onChange={(e) => setEstrategiaId(e.target.value)}
        >
          {estrategias.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome} (v{x.versao}){vende(x) ? " · compra e vende" : ""}
            </option>
          ))}
        </CampoSelecao>
        {ehWin ? null : (
          <CampoSelecao rotulo="Par" value={simbolo} onChange={(e) => setSimbolo(e.target.value)}>
            {["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </CampoSelecao>
        )}
        <CampoSelecao
          rotulo="Intervalo"
          value={ehWin ? intervaloWin : intervalo}
          onChange={(e) => setIntervalo(e.target.value as Intervalo)}
        >
          {(ehWin ? INTERVALOS_WIN : (["15m", "1h", "4h", "1d"] as const)).map((i) => (
            <option key={i}>{i}</option>
          ))}
        </CampoSelecao>
        <Segmentado rotulo="Período" opcoes={PERIODOS} valor={dias} aoMudar={setDias} />
        <Botao
          type="submit"
          variante="primario"
          icone={Play}
          carregando={criar.isPending}
          disabled={!escolhida || !valido}
        >
          Rodar backtest
        </Botao>
      </div>
      {mercado === SIMBOLO_WIN_IBOV ? <p className="bt-aviso-aproximacao">{TEXTO_APROXIMACAO}</p> : null}
      {ehWin && !janela ? (
        mercado === SIMBOLO_WIN && !cobertura.some((c) => c.simbolo === SIMBOLO_WIN) ? (
          <SemDadosWin demo={fonte.demo} aoImportar={() => void dadosWin.refetch()} />
        ) : (
          <p className="bt-nota">
            Não há candles de {mercado} em {intervaloWin} gravados. Escolha outro intervalo ou importe os
            dados (veja docs/dados-b3.md).
          </p>
        )
      ) : null}
      {janela ? <JanelaDoWin janela={janela} /> : null}
      {ehWin && !fonte.demo ? (
        <AtualizarWin api={apiImportacao} aoConcluir={() => void dadosWin.refetch()} />
      ) : null}
      <details className="bt-avancado">
        <summary>
          <SlidersHorizontal size={14} aria-hidden="true" />{" "}
          {ehWin ? "Custos, sessão, tamanho e validação" : "Custos, limites e validação"}{" "}
          <span className="apagado">
            {ehWin
              ? "(padrão: R$ 0,25 de tarifa e 1 tick por lado, entradas 09:15–17:30, zeragem 18:15, risco de R$ 100, 70/30)"
              : "(padrão: taxa 0,1%, deslizamento 5 + meio spread 2 pontos-base, limites do robô, 70/30)"}
          </span>
        </summary>
        {ehWin ? (
          <CamposDoWin
            c={camposWin}
            erros={erros}
            mudar={(p) => setCamposWin((atual) => ({ ...atual, ...p }))}
            a={avancado}
            mudarAvancado={mudarAvancado}
          />
        ) : (
          <CamposAvancados a={avancado} mudar={mudarAvancado} dias={Number(dias)} robos={robos} />
        )}
      </details>
    </form>
  );
}
