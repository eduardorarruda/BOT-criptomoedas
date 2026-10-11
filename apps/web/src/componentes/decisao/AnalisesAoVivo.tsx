import type { RoboDTO } from "@zentrade/contratos/esquemas";
import { lojaAnalises } from "../../ganchos/lojas";
import { useLoja } from "../../lib/loja";
import { Pensando } from "./Pensando";

/** Todas as análises em andamento (ou recém-concluídas), mais nova primeiro. */
export function AnalisesAoVivo({
  robos,
  roboId,
}: {
  readonly robos: readonly RoboDTO[];
  readonly roboId?: string | undefined;
}) {
  const analises = useLoja(lojaAnalises, (s) => s);
  const lista = Object.values(analises)
    .filter((a) => !roboId || a.roboId === roboId)
    .reverse();
  if (lista.length === 0) return null;
  return (
    <div className="analises">
      {lista.map((a) => (
        <Pensando key={a.id} analise={a} robo={robos.find((r) => r.id === a.roboId)} />
      ))}
    </div>
  );
}
