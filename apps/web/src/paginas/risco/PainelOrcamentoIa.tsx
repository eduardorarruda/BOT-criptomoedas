import type { LimitesContaDTO, OrcamentoIa } from "@zentrade/contratos/esquemas";
import { BrainCircuit, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { Painel } from "../../componentes/Cabecalho";
import { CampoTexto } from "../../componentes/Campo";
import { nomeDoFusoDaInstancia } from "../../lib/fuso";
import { lerFormulario, paraFormulario } from "./formulario";
import { useSalvarLimites } from "./ganchos";
import { Medidores } from "./Medidores";
import { medidoresDoOrcamento } from "./medidores";

/**
 * Quanto a IA (análises dos robôs e assistente) gastou no mês e no dia, contra o teto.
 * No teto, as análises voltam como "aguardar" e o assistente para; com o agente
 * obrigatório, os robôs não compram (stops seguem).
 */
export function PainelOrcamentoIa({
  orcamento,
  limites,
}: {
  readonly orcamento: OrcamentoIa;
  readonly limites: LimitesContaDTO;
}) {
  const salvar = useSalvarLimites();
  const avisar = useAvisos();
  const inicial = paraFormulario(limites);
  const [mensal, setMensal] = useState(inicial.orcamentoIaMensalUsd);
  const [diario, setDiario] = useState(inicial.orcamentoIaDiarioUsd);
  const [erro, setErro] = useState<{ mensal?: string; diario?: string }>({});

  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    const lido = lerFormulario({
      ...paraFormulario(limites),
      orcamentoIaMensalUsd: mensal,
      orcamentoIaDiarioUsd: diario,
    });
    if (!lido.ok) {
      setErro({
        ...(lido.erros.orcamentoIaMensalUsd ? { mensal: lido.erros.orcamentoIaMensalUsd } : {}),
        ...(lido.erros.orcamentoIaDiarioUsd ? { diario: lido.erros.orcamentoIaDiarioUsd } : {}),
      });
      return;
    }
    setErro({});
    salvar.mutate(lido.limites, {
      onSuccess: () => avisar("sucesso", "Orçamento de IA salvo. Vale na próxima análise ou pergunta."),
      onError: (er) => avisar("erro", mensagemDe(er)),
    });
  };

  return (
    <Painel
      titulo="Orçamento de IA"
      id="titulo-orcamento-ia"
      icone={BrainCircuit}
      variante={orcamento.esgotado ? "perigo" : "padrao"}
      descricao={`Análises dos robôs e respostas do assistente, nos dois provedores (API e Claude Code). Mês e dia no ${nomeDoFusoDaInstancia()}.`}
    >
      <Medidores medidores={medidoresDoOrcamento(orcamento)} />
      {orcamento.esgotado ? (
        <p className="medidor__aviso" role="note">
          Orçamento esgotado: as análises voltam como &quot;aguardar&quot; e o assistente explica que parou.
          Com o agente obrigatório, os robôs não compram; stops seguem.
        </p>
      ) : null}
      <form className="formulario formulario--linha" onSubmit={enviar} noValidate>
        <CampoTexto
          rotulo="Teto do mês (US$)"
          inputMode="decimal"
          value={mensal}
          onChange={(e) => setMensal(e.target.value)}
          erro={erro.mensal ?? null}
          dica="Vazio = sem teto."
        />
        <CampoTexto
          rotulo="Teto do dia (US$)"
          inputMode="decimal"
          value={diario}
          onChange={(e) => setDiario(e.target.value)}
          erro={erro.diario ?? null}
          dica="Opcional."
        />
        <Botao type="submit" icone={Save} carregando={salvar.isPending}>
          Salvar orçamento
        </Botao>
      </form>
    </Painel>
  );
}
