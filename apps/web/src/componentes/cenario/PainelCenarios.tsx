import { cenariosDosAtuais, type CenarioDoAtivoDTO } from "@zentrade/contratos/esquemas";
import { Compass } from "lucide-react";
import { useMemo } from "react";
import { usePensamentos, useRobos } from "../../ganchos/consultas";
import { useAgora } from "../../ganchos/useAgora";
import { Painel } from "../Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../Estados";
import { CartaoCenario } from "./CartaoCenario";
import { ComoLerOCenario } from "./Cenario";

/** Alta, depois queda, depois lateral: o que o robô "entende" primeiro aparece primeiro. */
const ORDEM = { alta: 0, queda: 1, lateral: 2, indefinido: 3 } as const;

const porCenario = (a: CenarioDoAtivoDTO, b: CenarioDoAtivoDTO): number =>
  ORDEM[a.cenario.cenario] - ORDEM[b.cenario.cenario] || a.simbolo.localeCompare(b.simbolo);

/**
 * "Cenário agora": um cartão por ativo dos robôs ativos, dizendo se a estratégia está
 * enxergando alta, queda ou mercado lateral, com os números e o que cada robô faz.
 */
export function PainelCenarios({ id = "titulo-cenarios" }: { readonly id?: string }) {
  const pensamentos = usePensamentos();
  const robos = useRobos().data;
  const agora = useAgora(30_000);
  const ativos = useMemo(
    () => cenariosDosAtuais(pensamentos.data ?? []).sort(porCenario),
    [pensamentos.data],
  );
  const nomeDoRobo = (roboId: string): string => robos?.find((r) => r.id === roboId)?.nome ?? "Robô removido";
  return (
    <Painel
      titulo="Cenário agora"
      id={id}
      icone={Compass}
      descricao="Como as estratégias estão lendo cada ativo, a cada vela fechada: tendência de alta, de queda ou lateral."
    >
      {pensamentos.isPending ? (
        <Esqueleto forma="cartoes" quantidade={2} rotulo="Carregando o cenário" />
      ) : null}
      {pensamentos.error ? (
        <ErroCarregar erro={pensamentos.error} tentarDeNovo={() => void pensamentos.refetch()} compacto />
      ) : null}
      {pensamentos.data && ativos.length === 0 ? (
        <EstadoVazio icone={Compass} titulo="Ainda sem leitura" compacto>
          O primeiro cenário aparece quando um robô ligado fechar sua primeira vela.
        </EstadoVazio>
      ) : null}
      {ativos.length > 0 ? (
        <ul className="cenarios-grade" role="list">
          {ativos.map((a) => (
            <li key={`${a.simbolo}:${a.intervalo}`}>
              <CartaoCenario
                ativo={a}
                robos={(pensamentos.data ?? []).filter((p) => a.roboIds.includes(p.roboId))}
                nomeDoRobo={nomeDoRobo}
                agora={agora}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {ativos.length > 0 ? <ComoLerOCenario /> : null}
    </Painel>
  );
}
