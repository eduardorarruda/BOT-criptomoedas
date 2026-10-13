import type { ConfigPublica } from "@zentrade/contratos/esquemas";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useFonte } from "../../api/contexto";
import {
  ARMAZENAMENTOS,
  ATUALIZADA_EM,
  COMPARTILHAMENTOS,
  DADOS,
  DIREITOS,
  FINALIDADES,
  PERGUNTAS,
  RETENCOES,
  SECOES,
} from "./dados";

/**
 * O texto da política de privacidade (LGPD). Serve à página /privacidade (seções em
 * h2, abaixo do h1) e ao diálogo do rodapé (seções em h3, abaixo do título do diálogo).
 */
type Nivel = 2 | 3;

export const CHAVE_CONFIG_PUBLICA = ["publico", "config"] as const;

export function useConfigPublica() {
  const fonte = useFonte();
  return useQuery({
    queryKey: CHAVE_CONFIG_PUBLICA,
    queryFn: () => fonte.configPublica(),
    staleTime: Infinity,
  });
}

function Titulo({
  nivel,
  id,
  children,
}: {
  readonly nivel: Nivel | 4;
  readonly id?: string;
  readonly children: ReactNode;
}) {
  const Tag = `h${nivel}` as const;
  return (
    <Tag id={id} className={`legal__titulo legal__titulo--${nivel}`}>
      {children}
    </Tag>
  );
}

const titulo = (id: string): string => SECOES.find((s) => s.id === id)?.titulo ?? id;

/** Cada seção com o título no nível certo e um id para o sumário (o diálogo usa outro prefixo). */
function Secao({
  id,
  nivel,
  prefixo,
  children,
}: {
  readonly id: string;
  readonly nivel: Nivel;
  readonly prefixo: string;
  readonly children: ReactNode;
}) {
  const idTitulo = `${prefixo}${id}`;
  return (
    <section className="legal__secao" aria-labelledby={idTitulo}>
      <Titulo nivel={nivel} id={idTitulo}>
        {titulo(id)}
      </Titulo>
      {children}
    </section>
  );
}

function Contato({
  rotulo,
  contato,
}: {
  readonly rotulo: string;
  readonly contato: ConfigPublica["controlador"];
}) {
  if (!contato) return null;
  return (
    <div className="legal__contato">
      <dt>{rotulo}</dt>
      <dd>
        {contato.nome} · <a href={`mailto:${contato.email}`}>{contato.email}</a>
      </dd>
    </div>
  );
}

function Controlador() {
  const fonte = useFonte();
  const consulta = useConfigPublica();
  if (consulta.isPending)
    return <p className="legal__apagado">Carregando o contato de quem opera esta instância…</p>;
  if (consulta.isError) {
    return (
      <p className="legal__apagado" role="status">
        Não foi possível carregar o contato agora. Recarregue a página em instantes.
      </p>
    );
  }
  const { controlador, encarregado } = consulta.data;
  if (controlador) {
    return (
      <dl className="legal__contatos">
        <Contato rotulo="Controlador" contato={controlador} />
        {encarregado ? (
          <Contato rotulo="Encarregado (DPO)" contato={encarregado} />
        ) : (
          <div className="legal__contato">
            <dt>Encarregado (DPO)</dt>
            <dd>O próprio controlador atende, pelo mesmo e-mail.</dd>
          </div>
        )}
      </dl>
    );
  }
  if (fonte.demo) {
    return (
      <p className="legal__aviso">
        <strong>Modo de exemplo.</strong> Os dados desta demonstração são fictícios e ficam só no seu
        navegador; nada é enviado a um servidor. Numa instância de verdade, aqui aparecem o nome e o e-mail de
        quem a opera.
      </p>
    );
  }
  return (
    <div className="legal__aviso legal__aviso--operador" role="note">
      <p>
        <strong>Aviso para quem opera esta instância:</strong> o controlador ainda não foi informado. Preencha{" "}
        <code>ZENTRADE_CONTROLADOR_NOME</code> e <code>ZENTRADE_CONTROLADOR_EMAIL</code> (e, se houver,{" "}
        <code>ZENTRADE_ENCARREGADO_NOME</code> e <code>ZENTRADE_ENCARREGADO_EMAIL</code>) no ambiente da API e
        reinicie; o passo a passo está em <code>docs/privacidade.md</code>.
      </p>
      <p>Até lá, peça seus direitos a quem lhe deu acesso a esta instância.</p>
    </div>
  );
}

export function ConteudoPrivacidade({
  nivel,
  prefixo = "",
}: {
  readonly nivel: Nivel;
  readonly prefixo?: string;
}) {
  const sub = (nivel + 1) as 3 | 4;
  const s = { nivel, prefixo };
  return (
    <div className="legal">
      <Secao id="resumo" {...s}>
        <ul className="legal__lista">
          <li>
            Seus dados ficam no servidor de quem opera esta instância. Os autores do ZenTrade não os recebem.
          </li>
          <li>Não há publicidade, rastreamento, análise de audiência nem venda de dados.</li>
          <li>Senhas, chaves da corretora e o segredo do 2FA ficam protegidos por hash ou cifra.</li>
          <li>
            Alguns recursos enviam dados a terceiros quando você os usa: a corretora, o Open Finance, a IA e
            os alertas. Cada um está descrito abaixo.
          </li>
          <li>Você pode pedir acesso, correção, cópia e exclusão dos seus dados.</li>
        </ul>
      </Secao>

      <Secao id="controlador" {...s}>
        <p>
          O ZenTrade é um software livre: cada instância é instalada e operada por uma pessoa ou organização,
          que decide como os dados são tratados e é a <strong>controladora</strong> deles pela Lei Geral de
          Proteção de Dados (LGPD, Lei nº 13.709/2018). Os autores do projeto não operam esta instância.
        </p>
        <Controlador />
      </Secao>

      <Secao id="dados" {...s}>
        <p>Só o necessário para o que você usa. Por categoria:</p>
        <dl className="legal__itens">
          {DADOS.map((d) => (
            <div key={d.titulo} className="legal__item">
              <dt>{d.titulo}</dt>
              <dd>{d.texto}</dd>
            </div>
          ))}
        </dl>
      </Secao>

      <Secao id="finalidades" {...s}>
        <p>Cada uso tem uma base legal do art. 7º da LGPD:</p>
        <dl className="legal__itens">
          {FINALIDADES.map((f) => (
            <div key={f.finalidade} className="legal__item">
              <dt>{f.finalidade}</dt>
              <dd>
                <span className="legal__rotulo">Base legal:</span> {f.base}
              </dd>
            </div>
          ))}
        </dl>
        <p>Seus dados não são vendidos nem usados para publicidade.</p>
      </Secao>

      <Secao id="compartilhamento" {...s}>
        <p>
          O ZenTrade só envia dados para fora do servidor quando um recurso precisa. Quem recebe trata os
          dados também pelas próprias políticas de privacidade.
        </p>
        <div className="legal__cartoes">
          {COMPARTILHAMENTOS.map((c) => (
            <section key={c.quem} className="legal__cartao" aria-label={c.quem}>
              <Titulo nivel={sub}>{c.quem}</Titulo>
              <p className="legal__apagado">
                {c.onde} · {c.quando}
              </p>
              <p>{c.oQue}</p>
            </section>
          ))}
        </div>
        <p>
          Os dados também podem ser entregues a autoridades quando a lei exigir. O projeto ZenTrade não tem
          telemetria: nada sobre o uso desta instância vai para os autores.
        </p>
      </Secao>

      <Secao id="internacional" {...s}>
        <p>
          Binance, Anthropic, Voyage AI e Telegram tratam dados fora do Brasil, principalmente nos Estados
          Unidos. A transferência acontece porque é necessária para o recurso que você pediu (art. 33, IX, com
          o art. 7º, V, da LGPD).
        </p>
        <p>
          Dá para evitar: sem chave de corretora, sem IA (assistente, análises e Voyage) e sem alertas, nada
          sai do país. Quem opera pode trocar a Voyage pelo Ollama, que roda no próprio servidor.
        </p>
      </Secao>

      <Secao id="retencao" {...s}>
        <dl className="legal__itens">
          {RETENCOES.map((r) => (
            <div key={r.dado} className="legal__item">
              <dt>{r.dado}</dt>
              <dd>{r.prazo}</dd>
            </div>
          ))}
        </dl>
        <p>
          <strong>Exclusão da conta.</strong> Ainda não há um botão para excluir a conta. Peça pelo contato do
          controlador: ele apaga seus dados do banco, exceto a trilha de auditoria e o que a lei mandar
          guardar.
        </p>
      </Secao>

      <Secao id="direitos" {...s}>
        <p>Pela LGPD (art. 18), você pode, a qualquer momento:</p>
        <ul className="legal__lista">
          {DIREITOS.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <p>
          <strong>Como pedir:</strong> escreva para o e-mail do controlador, na seção “Quem cuida dos seus
          dados”. Pode ser preciso confirmar que é você. A confirmação e o acesso simplificado saem na hora; a
          declaração completa, em até 15 dias (art. 19).
        </p>
        <p>
          <strong>Na própria tela</strong> você apaga conversas do assistente, documentos do conhecimento,
          títulos de renda fixa, imóveis e lançamentos, chaves da corretora e tokens, e desconecta bancos.
          Cada decisão dos robôs fica registrada com o porquê e as fontes, o que permite revisá-la.
        </p>
      </Secao>

      <Secao id="seguranca" {...s}>
        <ul className="legal__lista">
          <li>Cada pessoa só enxerga os próprios dados, regra garantida pelo banco (Row Level Security).</li>
          <li>Chaves da corretora e o segredo do 2FA cifrados com AES-256-GCM; senha com Argon2id.</li>
          <li>
            Sessões e tokens guardados só como hash; cookies HttpOnly e SameSite=Strict, com proteção CSRF.
          </li>
          <li>Login com 2FA e nova confirmação de identidade antes de ações sensíveis.</li>
          <li>Trilha de auditoria encadeada por hash, que não pode ser alterada nem apagada.</li>
          <li>
            Política de segurança de conteúdo (CSP), limite de tentativas e registros sem senhas nem chaves.
          </li>
        </ul>
        <p>
          Nenhum sistema é infalível. Se um incidente puder causar risco ou dano relevante, quem opera deve
          avisar você e a ANPD (art. 48).
        </p>
      </Secao>

      <Secao id="cookies" {...s}>
        <div
          className="legal__tabela-rolagem"
          role="region"
          aria-label="Cookies e armazenamento"
          // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- tabela larga rola de lado no celular: pelo teclado também (WCAG 2.1.1)
          tabIndex={0}
        >
          <table className="legal__tabela">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Tipo</th>
                <th scope="col">Para quê</th>
              </tr>
            </thead>
            <tbody>
              {ARMAZENAMENTOS.map((a) => (
                <tr key={a.nome}>
                  <th scope="row">
                    <code>{a.nome}</code>
                  </th>
                  <td>{a.tipo}</td>
                  <td>{a.paraQue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Não há cookies de análise, publicidade ou rastreamento, nem de terceiros. A exceção é a janela da
          Pluggy, que pode usar os próprios cookies quando você conecta um banco. Como tudo aqui é
          estritamente necessário para o serviço que você pediu, não há aviso de consentimento de cookies.
        </p>
      </Secao>

      <Secao id="criancas" {...s}>
        <p>
          O ZenTrade não é destinado a menores de 18 anos; operar numa corretora exige maioridade. Se uma
          conta de menor for identificada, peça a exclusão ao controlador.
        </p>
      </Secao>

      <Secao id="mudancas" {...s}>
        <p>
          Quando esta política mudar, a data abaixo muda junto; mudanças relevantes são avisadas por quem
          opera a instância. O histórico completo fica no repositório público do projeto.
        </p>
        <p className="legal__data">Última atualização: {ATUALIZADA_EM}.</p>
      </Secao>

      <Secao id="perguntas" {...s}>
        {PERGUNTAS.map((p) => (
          <div key={p.titulo} className="legal__pergunta">
            <Titulo nivel={sub}>{p.titulo}</Titulo>
            <p>{p.texto}</p>
          </div>
        ))}
      </Secao>
    </div>
  );
}
