import type { PausaConta } from "@zentrade/contratos/esquemas";
import { PauseCircle, PlayCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { Painel } from "../../componentes/Cabecalho";
import { Confirmar } from "../../componentes/Confirmar";
import { EstadoVazio } from "../../componentes/Estados";
import { Selo } from "../../componentes/Selo";
import { useRobos } from "../../ganchos/consultas";
import { REDE } from "../../lib/rotulos";
import { formatarDuracao, formatarHora } from "../../lib/tempo";
import { useLiberarPausas } from "./ganchos";
import { PAUSA } from "./rotulos";

function quandoLibera(p: PausaConta, agora: number): string {
  if (p.ate === null)
    return p.codigo === "divergencia_saldo"
      ? "Só depois de resolver a divergência (abaixo)."
      : "Só com uma ação sua.";
  const falta = Math.max(0, p.ate - agora);
  return `Libera sozinha às ${formatarHora(p.ate)} (em ${formatarDuracao(falta)})${p.liberavel ? ", ou agora pelo botão" : ""}.`;
}

function ItemPausa({ p, agora }: { readonly p: PausaConta; readonly agora: number }) {
  const robos = useRobos().data ?? [];
  const rotulo = PAUSA[p.codigo];
  const robo = p.roboId ? robos.find((r) => r.id === p.roboId)?.nome : null;
  return (
    <li className="pausa">
      <div className="pausa__topo">
        <Selo tom={rotulo.tom} icone={rotulo.icone}>
          {rotulo.texto}
        </Selo>
        {p.rede ? <Selo tom={REDE[p.rede].tom}>{REDE[p.rede].texto}</Selo> : null}
        {robo ? <strong>{robo}</strong> : null}
      </div>
      <p>{p.motivo}</p>
      <p className="apagado">{quandoLibera(p, agora)}</p>
    </li>
  );
}

/**
 * As pausas de compra em vigor (limites da conta, divergência, orçamento de IA), com o
 * motivo e quando acabam. Vendas e stops nunca ficam pausados por elas.
 */
export function PainelPausas({
  pausas,
  agora,
}: {
  readonly pausas: readonly PausaConta[];
  readonly agora: number;
}) {
  const liberar = useLiberarPausas();
  const avisar = useAvisos();
  const [confirmando, setConfirmando] = useState(false);
  const liberaveis = pausas.filter((p) => p.liberavel).length;
  return (
    <Painel
      titulo="Pausas em vigor"
      id="titulo-pausas"
      icone={PauseCircle}
      variante={pausas.length > 0 ? "atencao" : "padrao"}
      descricao="Pausas só seguram compras novas. Vendas e stops seguem sempre."
      acoes={
        liberaveis > 0 ? (
          <Botao pequeno icone={PlayCircle} onClick={() => setConfirmando(true)}>
            Liberar agora
          </Botao>
        ) : null
      }
    >
      {pausas.length === 0 ? (
        <EstadoVazio compacto icone={ShieldCheck} titulo="Nenhuma pausa">
          As compras seguem os limites de cada robô e da conta.
        </EstadoVazio>
      ) : (
        <ul role="list" className="pausas">
          {pausas.map((p) => (
            <ItemPausa key={`${p.codigo}-${p.rede ?? "todas"}-${p.roboId ?? "conta"}`} p={p} agora={agora} />
          ))}
        </ul>
      )}
      <Confirmar
        aberto={confirmando}
        titulo="Liberar as pausas de queda e de stops?"
        rotuloConfirmar="Liberar compras"
        carregando={liberar.isPending}
        aoCancelar={() => setConfirmando(false)}
        aoConfirmar={() =>
          liberar.mutate(undefined, {
            onSuccess: () => {
              avisar("sucesso", "Pausas liberadas: o pico e a contagem de stops recomeçam de agora.");
              setConfirmando(false);
            },
            onError: (e) => avisar("erro", mensagemDe(e)),
          })
        }
      >
        O pico da queda e as perdas da sequência de stops passam a contar de agora. A perda do dia, as
        divergências e o orçamento de IA continuam valendo. Antes de liberar, entenda por que o robô parou.
        Você vai confirmar sua identidade.
      </Confirmar>
    </Painel>
  );
}
