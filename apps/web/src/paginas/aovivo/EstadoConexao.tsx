import { lojaConexao, lojaUltimoEvento } from "../../ganchos/lojas";
import { useAgora } from "../../ganchos/useAgora";
import { useLoja } from "../../lib/loja";
import { formatarDuracao } from "../../lib/tempo";

const TEXTO = {
  conectado: "Conectado",
  conectando: "Conectando…",
  reconectando: "Reconectando…",
  desligado: "Desconectado",
} as const;

/**
 * Estado da conexão ao vivo, com a idade do último evento: "conectado" sozinho não
 * prova que os dados estão chegando. O texto muda devagar para o leitor de tela.
 */
export function EstadoConexao() {
  const estado = useLoja(lojaConexao, (s) => s);
  const ultimo = useLoja(lojaUltimoEvento, (s) => s);
  const agora = useAgora(1000);
  const idade = ultimo === null ? null : Math.max(0, agora - ultimo);
  return (
    <p className={`conexao conexao--${estado} aovivo-conexao`}>
      <span className="conexao__ponto" aria-hidden="true" />
      {/* Só o estado é anunciado; a idade muda a cada segundo e não entra na região viva. */}
      <span role="status">{TEXTO[estado]}</span>
      <span className="apagado aovivo-conexao__idade">
        {idade === null ? "· esperando o próximo evento" : `· último evento há ${formatarDuracao(idade)}`}
      </span>
    </p>
  );
}
