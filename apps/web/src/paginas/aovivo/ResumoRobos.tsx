import type { PosicaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { ChevronRight } from "lucide-react";
import type { RegistroAoVivo } from "../../api/esquemas";
import { Dinheiro } from "../../componentes/Dinheiro";
import { PrecoAoVivo } from "../../componentes/PrecoAoVivo";
import { Selo } from "../../componentes/Selo";
import { lojaPrecos } from "../../ganchos/lojas";
import { descrever } from "../../lib/aovivo/descrever";
import { useLoja } from "../../lib/loja";
import { naoRealizado, temQuantidade } from "../../lib/posicao";
import { MODO_ROBO } from "../../lib/rotulos";
import { formatarRelativo } from "../../lib/tempo";

interface Props {
  readonly robos: readonly RoboDTO[];
  readonly posicoes: ReadonlyMap<string, PosicaoDTO>;
  readonly ultimos: ReadonlyMap<string, RegistroAoVivo>;
  readonly agora: number;
  readonly escolher: (roboId: string) => void;
}

function Cartao(p: {
  readonly robo: RoboDTO;
  readonly posicao: PosicaoDTO | undefined;
  readonly ultimo: RegistroAoVivo | undefined;
  readonly agora: number;
  readonly escolher: () => void;
}) {
  const { robo, posicao, ultimo } = p;
  const preco = useLoja(lojaPrecos, (s) => s[robo.simbolo]?.preco ?? null);
  const aberta = posicao && temQuantidade(posicao.quantidade);
  const modo = MODO_ROBO[robo.modo];
  const descricao = ultimo ? descrever(ultimo.evento) : null;
  return (
    <li>
      <button
        type="button"
        className={`cartao-robo ${robo.pausado ? "cartao-robo--pausado" : ""}`}
        onClick={p.escolher}
      >
        <span className="cartao-robo__topo">
          <span className="cartao-robo__nome">{robo.nome}</span>
          <ChevronRight size={16} aria-hidden="true" className="apagado" />
        </span>
        <span className="cartao-robo__meta">
          <span className="num">{robo.simbolo.replace("USDT", "/USDT")}</span>
          <PrecoAoVivo simbolo={robo.simbolo} />
        </span>
        <span className="cartao-robo__selos">
          <Selo icone={modo.icone}>{modo.texto}</Selo>
          {robo.pausado ? <Selo tom="atencao">Pausado</Selo> : null}
        </span>
        <span className="cartao-robo__posicao">
          {aberta && preco ? (
            <>
              Não realizado{" "}
              <Dinheiro
                valor={naoRealizado(posicao.quantidade, posicao.precoMedio, preco)}
                sinal
                colorir
                animar
              />
            </>
          ) : (
            <span className="apagado">{aberta ? "Posição aberta" : "Sem posição"}</span>
          )}
        </span>
        <span className="cartao-robo__ultimo apagado">
          {descricao && ultimo
            ? `${descricao.titulo} · ${formatarRelativo(ultimo.recebidoEm, p.agora)}`
            : "Nada ainda desde que a tela abriu"}
        </span>
      </button>
    </li>
  );
}

/** Todos os robôs de uma vez; escolher um abre o gráfico e a posição dele. */
export function ResumoRobos({ robos, posicoes, ultimos, agora, escolher }: Props) {
  return (
    <ul role="list" className="cartoes-robos" aria-label="Robôs">
      {robos.map((r) => (
        <Cartao
          key={r.id}
          robo={r}
          posicao={posicoes.get(r.id)}
          ultimo={ultimos.get(r.id)}
          agora={agora}
          escolher={() => escolher(r.id)}
        />
      ))}
    </ul>
  );
}
