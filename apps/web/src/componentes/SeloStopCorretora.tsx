import type { ProtecaoCorretoraDTO } from "@zentrade/contratos/esquemas";
import { ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { formatarPreco } from "../lib/formatar";
import { Selo } from "./Selo";

const SO_NO_ROBO = "Sem stop no livro da corretora: o robô vigia o stop no fechamento de cada minuto.";

/**
 * "Stop na corretora: ativo a X". A proteção da posição no livro da corretora (OCO ou
 * stop-limit), que vale mesmo com o motor fora do ar. Sem posição aberta, nada.
 */
export function SeloStopCorretora({
  protecao: p,
  aberta,
}: {
  readonly protecao?: ProtecaoCorretoraDTO | undefined;
  readonly aberta: boolean;
}) {
  if (!aberta) return <span className="apagado">—</span>;
  if (!p)
    return (
      <span title={SO_NO_ROBO}>
        <Selo icone={ShieldOff}>Só no robô</Selo>
      </span>
    );
  if (p.estado === "ATIVA")
    return (
      <span
        title={`Venda disparada a ${formatarPreco(p.stop)}, com limite em ${formatarPreco(p.limite)}. Vale mesmo com o motor fora do ar.`}
      >
        <Selo tom="ganho" icone={ShieldCheck}>
          Ativo a {formatarPreco(p.stop)}
        </Selo>
        {p.alvo ? <span className="apagado"> · alvo {formatarPreco(p.alvo)}</span> : null}
      </span>
    );
  if (p.estado === "PENDENTE")
    return (
      <span title="A proteção foi enviada e o motor está confirmando com a corretora.">
        <Selo tom="atencao" icone={ShieldAlert}>
          Confirmando
        </Selo>
      </span>
    );
  if (p.estado === "REJEITADA")
    return (
      <span title={`A corretora recusou: ${p.motivo ?? "sem motivo"}. O robô vigia o stop e tenta de novo.`}>
        <Selo tom="perda" icone={ShieldAlert}>
          Recusado
        </Selo>
      </span>
    );
  return (
    <span title="A proteção saiu do livro; o motor coloca outra no próximo candle. Até lá, o robô vigia o stop.">
      <Selo tom="atencao" icone={ShieldAlert}>
        Fora do livro
      </Selo>
    </span>
  );
}
