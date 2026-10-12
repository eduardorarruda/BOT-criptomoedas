import { Bell, BellOff, CheckCheck } from "lucide-react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { Painel } from "../../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { Selo } from "../../componentes/Selo";
import { formatarRelativo } from "../../lib/tempo";
import { useAvisosConta, useMarcarAvisosLidos } from "./ganchos";
import { GRAVIDADE, TIPO_ALERTA } from "./rotulos";

const VISIVEIS = 12;

/**
 * Os alertas que chegaram (os mesmos do Telegram, já sem repetição). Os que passaram do
 * teto por pessoa ficam só aqui, marcados como "só na tela".
 */
export function PainelAvisos() {
  const avisos = useAvisosConta();
  const marcar = useMarcarAvisosLidos();
  const avisar = useAvisos();
  const lista = (avisos.data ?? []).slice(0, VISIVEIS);
  const naoLidos = lista.filter((a) => a.lidoEm === null).length;
  return (
    <Painel
      titulo="Avisos"
      id="titulo-avisos"
      icone={Bell}
      descricao={
        naoLidos > 0 ? `${naoLidos} não lido(s).` : "Stops, pausas, ordens recusadas, robôs e conexões."
      }
      acoes={
        naoLidos > 0 ? (
          <Botao
            pequeno
            variante="fantasma"
            icone={CheckCheck}
            carregando={marcar.isPending}
            onClick={() => marcar.mutate(undefined, { onError: (e) => avisar("erro", mensagemDe(e)) })}
          >
            Marcar como lidos
          </Botao>
        ) : null
      }
    >
      {avisos.isPending ? <Esqueleto forma="lista" linhas={3} rotulo="Carregando avisos" /> : null}
      {avisos.error ? (
        <ErroCarregar erro={avisos.error} tentarDeNovo={() => void avisos.refetch()} compacto />
      ) : null}
      {avisos.data?.length === 0 ? (
        <EstadoVazio compacto icone={BellOff} titulo="Nenhum aviso">
          Quando um stop for atingido, uma pausa começar ou algo falhar, o aviso aparece aqui e no Telegram.
        </EstadoVazio>
      ) : null}
      <ul role="list" className="avisos-conta">
        {lista.map((a) => {
          const g = GRAVIDADE[a.gravidade];
          return (
            <li key={a.id} className={`aviso-conta ${a.lidoEm === null ? "aviso-conta--novo" : ""}`.trim()}>
              <div className="pausa__topo">
                <Selo tom={g.tom} icone={g.icone}>
                  {g.texto}
                </Selo>
                <strong>{a.titulo}</strong>
                <span className="apagado">
                  {TIPO_ALERTA[a.tipo]} · {formatarRelativo(a.criadoEm)}
                  {a.enviado ? "" : " · só na tela"}
                  {a.lidoEm === null ? " · novo" : ""}
                </span>
              </div>
              <p>{a.mensagem}</p>
            </li>
          );
        })}
      </ul>
    </Painel>
  );
}
