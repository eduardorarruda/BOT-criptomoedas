import type { EscopoSequencia, LimitesContaDTO } from "@zentrade/contratos/esquemas";
import { Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { CampoSelecao, CampoTexto } from "../../componentes/Campo";
import { useSalvarLimites } from "./ganchos";
import { lerFormulario, paraFormulario, type FormularioLimites } from "./formulario";
import { nomeDoFusoDaInstancia } from "../../lib/fuso";

const ESCOPOS: readonly { readonly valor: EscopoSequencia; readonly texto: string }[] = [
  { valor: "ambos", texto: "Em cada robô e na conta" },
  { valor: "robo", texto: "Só em cada robô" },
  { valor: "conta", texto: "Só na conta (somando os robôs)" },
];

/**
 * Os limites da conta (somando os robôs da mesma rede). Campo de dinheiro vazio = sem
 * limite. Apertar salva direto; afrouxar pede para confirmar a identidade.
 */
export function FormLimites({ limites }: { readonly limites: LimitesContaDTO }) {
  const salvar = useSalvarLimites();
  const avisar = useAvisos();
  const [f, setF] = useState<FormularioLimites>(() => paraFormulario(limites));
  const [erros, setErros] = useState<Partial<Record<keyof FormularioLimites, string>>>({});
  const campo = (k: keyof FormularioLimites) => ({
    value: String(f[k]),
    onChange: (e: { target: { value: string } }) => setF((atual) => ({ ...atual, [k]: e.target.value })),
    erro: erros[k] ?? null,
  });

  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    // O orçamento de IA tem formulário próprio: vale o que está salvo agora, não o da abertura.
    const atual = paraFormulario(limites);
    const lido = lerFormulario({
      ...f,
      orcamentoIaMensalUsd: atual.orcamentoIaMensalUsd,
      orcamentoIaDiarioUsd: atual.orcamentoIaDiarioUsd,
    });
    if (!lido.ok) {
      setErros(lido.erros);
      return;
    }
    setErros({});
    salvar.mutate(lido.limites, {
      onSuccess: () => avisar("sucesso", "Limites da conta salvos. Valem na próxima decisão de cada robô."),
      onError: (er) => avisar("erro", mensagemDe(er)),
    });
  };

  return (
    <form className="formulario limites-conta" onSubmit={enviar} noValidate>
      <fieldset className="limites-conta__grupo">
        <legend>Perda e exposição</legend>
        <CampoTexto
          rotulo="Perda máxima do dia (US$)"
          inputMode="decimal"
          dica={`Somando os robôs da mesma rede. O dia vai de 00:00 a 23:59 (${nomeDoFusoDaInstancia()}). Vazio = sem limite.`}
          {...campo("perdaDiariaMaxima")}
        />
        <label className="caixa">
          <input
            type="checkbox"
            checked={f.incluirNaoRealizado}
            onChange={(e) => setF((a) => ({ ...a, incluirNaoRealizado: e.target.checked }))}
          />
          <span>Contar também o resultado não realizado das posições abertas.</span>
        </label>
        <CampoTexto
          rotulo="Exposição máxima (US$)"
          inputMode="decimal"
          dica="Valor das posições abertas de todos os robôs, a preço de mercado."
          {...campo("exposicaoMaxima")}
        />
        <CampoTexto
          rotulo="Posições abertas ao mesmo tempo"
          inputMode="numeric"
          dica="Entre todos os robôs. Vazio = sem limite."
          {...campo("posicoesAbertasMax")}
        />
      </fieldset>
      <fieldset className="limites-conta__grupo">
        <legend>Pausas automáticas</legend>
        <CampoTexto
          rotulo="Queda máxima do pico (US$)"
          inputMode="decimal"
          dica="Se o resultado acumulado cair isto desde o pico, compras param até o pico sair da janela ou você liberar."
          {...campo("quedaMaxima")}
        />
        <CampoTexto rotulo="Janela da queda (horas)" inputMode="numeric" {...campo("quedaJanelaHoras")} />
        <CampoTexto
          rotulo="Saídas com perda para pausar"
          inputMode="numeric"
          dica="Quantos stops (ou saídas com perda) dentro da janela pausam as compras. Vazio = sem pausa."
          {...campo("sequenciaStopsMax")}
        />
        <CampoTexto
          rotulo="Janela dos stops (horas)"
          inputMode="numeric"
          {...campo("sequenciaStopsJanelaHoras")}
        />
        <CampoSelecao
          rotulo="Contar os stops"
          value={f.sequenciaStopsEscopo}
          onChange={(e) => setF((a) => ({ ...a, sequenciaStopsEscopo: e.target.value as EscopoSequencia }))}
        >
          {ESCOPOS.map((x) => (
            <option key={x.valor} value={x.valor}>
              {x.texto}
            </option>
          ))}
        </CampoSelecao>
      </fieldset>
      <div className="formulario__acoes">
        <Botao type="submit" variante="primario" icone={Save} carregando={salvar.isPending}>
          Salvar limites da conta
        </Botao>
      </div>
      <p className="apagado">
        Apertar um limite vale na hora. Afrouxar (subir, tirar, encurtar janela) pede que você confirme sua
        identidade.
      </p>
    </form>
  );
}
