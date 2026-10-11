import type { RoboDTO } from "@zentrade/contratos/esquemas";
import { Painel } from "../../componentes/Cabecalho";
import { AnalisesAoVivo } from "../../componentes/decisao/AnalisesAoVivo";
import { Enso } from "../../componentes/Enso";
import { lojaAnalises } from "../../ganchos/lojas";
import { useLoja } from "../../lib/loja";

/** O que a IA está consultando agora; quieto quando ela não foi chamada. */
export function PainelPensando({
  robos,
  roboId,
}: {
  readonly robos: readonly RoboDTO[];
  readonly roboId: string | undefined;
}) {
  const algum = useLoja(lojaAnalises, (s) => Object.values(s).some((a) => !roboId || a.roboId === roboId));
  return (
    <Painel titulo="Pensando" id="titulo-pensando" className="aovivo-pensando">
      {algum ? (
        <AnalisesAoVivo robos={robos} roboId={roboId} />
      ) : (
        <div className="aovivo-pensando__quieto">
          <Enso tamanho={28} />
          <p>
            A IA não está analisando agora. Ela só é chamada quando a regra dá sinal de compra ou venda — e
            cada ferramenta que ela consultar aparece aqui, na hora.
          </p>
        </div>
      )}
    </Painel>
  );
}
