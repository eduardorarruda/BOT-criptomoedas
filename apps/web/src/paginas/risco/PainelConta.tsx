import type { SituacaoConta } from "@zentrade/contratos/esquemas";
import { Gauge } from "lucide-react";
import { Painel } from "../../componentes/Cabecalho";
import { EstadoVazio } from "../../componentes/Estados";
import { Selo } from "../../componentes/Selo";
import { formatarDinheiro } from "../../lib/formatar";
import { nomeDoFusoDaInstancia } from "../../lib/fuso";
import { REDE } from "../../lib/rotulos";
import { Medidores } from "./Medidores";
import { medidoresDaRede } from "./medidores";

/**
 * O estado de cada limite da conta agora, por rede (cada rede é uma conta separada da
 * corretora: papel, testnet e real não se somam).
 */
export function PainelConta({ situacao }: { readonly situacao: SituacaoConta }) {
  return (
    <Painel
      titulo="Limites da conta agora"
      id="titulo-conta"
      icone={Gauge}
      descricao={`Somando os robôs de cada rede. O dia começa à meia-noite (${nomeDoFusoDaInstancia()}), como no motor.`}
    >
      {situacao.redes.length === 0 ? (
        <EstadoVazio compacto icone={Gauge} titulo="Nenhum robô ainda">
          Os limites da conta passam a contar quando houver robô.
        </EstadoVazio>
      ) : null}
      <div className="conta-redes">
        {situacao.redes.map((r) => (
          <section key={r.rede} className="conta-rede" aria-labelledby={`conta-rede-${r.rede}`}>
            <h3 id={`conta-rede-${r.rede}`} className="conta-rede__titulo">
              <Selo tom={REDE[r.rede].tom}>{REDE[r.rede].texto}</Selo>
              <span className="apagado">
                {r.robos} robô(s) · realizado hoje {formatarDinheiro(r.realizadoDoDia, { sinal: true })} · não
                realizado {formatarDinheiro(r.naoRealizado, { sinal: true })}
              </span>
            </h3>
            <Medidores medidores={medidoresDaRede(r, situacao.limites)} />
          </section>
        ))}
      </div>
    </Painel>
  );
}
