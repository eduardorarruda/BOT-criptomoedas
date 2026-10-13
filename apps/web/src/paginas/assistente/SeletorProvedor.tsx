import { Link } from "@tanstack/react-router";
import type { EstadoAssistente, MudancaConfigAssistente, ProvedorIa } from "@zentrade/contratos/esquemas";
import { ChevronDown, Settings2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const NOME_PROVEDOR: Record<ProvedorIa, string> = {
  api: "Claude pela API",
  cli: "Claude Code (o seu plano)",
};
const CURTO: Record<ProvedorIa, string> = { api: "Claude API", cli: "Claude Code" };
const FALTA: Record<ProvedorIa, string> = {
  api: "o servidor não tem a chave da Anthropic",
  cli: "o Claude Code não está instalado no agente",
};

/** Por que não dá para perguntar agora (null = dá). */
export function motivoBloqueio(estado: EstadoAssistente | undefined): string | null {
  if (!estado) return null;
  if (!estado.agenteNoAr)
    return "O agente de IA está fora do ar. Confira se o serviço do agente está rodando e tente de novo em instantes.";
  const { provedores, config } = estado;
  if (!provedores.api && !provedores.cli)
    return "Nenhum provedor de IA está configurado no servidor: falta a chave da Anthropic (API) ou o Claude Code instalado no agente.";
  if (!provedores[config.provedor])
    return `${NOME_PROVEDOR[config.provedor]} não está disponível neste servidor (${FALTA[config.provedor]}). Escolha outro no seletor abaixo.`;
  return null;
}

function nomeModelo(estado: EstadoAssistente): string {
  const { provedor, modelo } = estado.config;
  if (!modelo) return "modelo padrão";
  return estado.modelos[provedor].find((m) => m.id === modelo)?.nome ?? modelo;
}

/**
 * O controle compacto do rodapé da caixa: quem responde (API ou Claude Code) e o
 * modelo. A conta do Claude Code e o modelo digitado à mão ficam nas configurações.
 */
export function SeletorProvedor({
  estado,
  salvando,
  aoMudar,
}: {
  readonly estado: EstadoAssistente | undefined;
  readonly salvando: boolean;
  readonly aoMudar: (m: MudancaConfigAssistente) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  if (!estado) return null;
  const { provedor, modelo } = estado.config;
  const fechar = () => {
    setAberto(false);
    botao.current?.focus();
  };
  return (
    // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- Esc dentro do painel fecha e devolve o foco ao botão
    <div
      className="seletor"
      ref={raiz}
      onKeyDown={(e) => {
        if (e.key === "Escape" && aberto) {
          e.preventDefault();
          fechar();
        }
      }}
    >
      <button
        ref={botao}
        type="button"
        className="seletor__botao"
        aria-expanded={aberto}
        aria-controls={id}
        aria-label={`${CURTO[provedor]} ${nomeModelo(estado)}. Quem responde: ${NOME_PROVEDOR[provedor]}. Trocar`}
        onClick={() => setAberto(!aberto)}
      >
        <span>{CURTO[provedor]}</span> <span className="seletor__modelo">{nomeModelo(estado)}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div
        id={id}
        className="seletor__painel"
        role="group"
        aria-label="Quem responde e com qual modelo"
        hidden={!aberto}
      >
        <fieldset className="seletor__grupo" disabled={salvando || !estado.agenteNoAr}>
          <legend>Quem responde</legend>
          {(["api", "cli"] as const).map((p) => (
            <label key={p} className={`seletor__opcao ${estado.provedores[p] ? "" : "seletor__opcao--off"}`}>
              <input
                type="radio"
                name={`${id}-provedor`}
                checked={provedor === p}
                disabled={!estado.provedores[p]}
                onChange={() => aoMudar({ provedor: p, modelo: null })}
              />
              <span>
                {NOME_PROVEDOR[p]}
                {estado.provedores[p] ? null : <small> — indisponível: {FALTA[p]}</small>}
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset
          className="seletor__grupo"
          disabled={salvando || !estado.agenteNoAr || !estado.provedores[provedor]}
        >
          <legend>Modelo</legend>
          <label className="seletor__opcao">
            <input
              type="radio"
              name={`${id}-modelo`}
              checked={modelo === null}
              onChange={() => aoMudar({ modelo: null })}
            />
            <span>Padrão do servidor</span>
          </label>
          {estado.modelos[provedor].map((m) => (
            <label key={m.id} className="seletor__opcao">
              <input
                type="radio"
                name={`${id}-modelo`}
                checked={modelo === m.id}
                onChange={() => aoMudar({ modelo: m.id })}
              />
              <span>
                {m.nome} <small>— {m.descricao}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <Link to="/assistente/configuracoes" className="seletor__mais">
          <Settings2 size={14} aria-hidden="true" /> Mais configurações
        </Link>
      </div>
    </div>
  );
}
