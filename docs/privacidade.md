# Privacidade e LGPD

Guia para quem **opera** uma instância do ZenTrade. A política que as pessoas leem fica na tela, em `/privacidade`, sem login, e num diálogo no rodapé do login e da casca. Este guia explica o que ela promete, o que você precisa configurar e o que o sistema ainda não faz.

> **Aviso: este texto é um modelo para quem opera a instância; revise com um advogado.** A política foi escrita conferindo o código em outubro de 2026. Ela não é parecer jurídico, e a sua situação pode exigir mais: por exemplo, contrato com clientes, registro das operações de tratamento, relatório de impacto, ou regras do Banco Central e da CVM se você oferecer o serviço a terceiros.

## Quem é o controlador

O ZenTrade é software, não serviço. Quem instala e opera uma instância decide como os dados são tratados, então é o **controlador** (LGPD, art. 5º, VI). Os autores do projeto não recebem dado nenhum: não há telemetria.

Se você roda o ZenTrade **só para você**, sem fins econômicos, a LGPD não se aplica a esse uso (art. 4º, I). Ela passa a valer quando a instância trata dados de outras pessoas, como família, sócios ou clientes.

### Configurar o controlador e o encarregado

No ambiente da API (`.env`), preencha:

```bash
ZENTRADE_CONTROLADOR_NOME="Sua empresa ou seu nome"
ZENTRADE_CONTROLADOR_EMAIL=privacidade@seu-dominio.com
# Opcional: encarregado (DPO). Sem ele, a política diz que o próprio controlador atende.
ZENTRADE_ENCARREGADO_NOME="Nome do encarregado"
ZENTRADE_ENCARREGADO_EMAIL=dpo@seu-dominio.com
```

Nome e e-mail andam em par: preencher só um derruba a API na partida, com a explicação. Reinicie a API depois de mudar.

A tela lê esses valores em `GET /api/v1/publico/config`, uma rota pública, com limite de pedidos e cache de 5 minutos. Ela devolve só o nome, o e-mail e a versão; está descrita em [contrato-api.md](contrato-api.md).

**Por que na API, e não no build da tela:** trocar o contato não exige reconstruir a imagem `web`, basta mudar o `.env` e reiniciar. O modo de exemplo (`VITE_DEMO=1`) não tem API; nele a política explica que nada sai do navegador.

**Sem configuração:** a política mostra um aviso para quem opera, com os nomes das variáveis. Assim, quem usa sabe que falta um contato.

Agentes de pequeno porte podem dispensar a indicação formal de encarregado (Resolução CD/ANPD nº 2/2022), mas precisam manter um canal para os titulares. O e-mail do controlador é esse canal.

## O que a política cobre

Cada item foi conferido no código. Ao mudar um fluxo de dados, atualize [`apps/web/src/paginas/privacidade/dados.ts`](../apps/web/src/paginas/privacidade/dados.ts) e a data de atualização.

- **Dados:**
  - conta: nome, e-mail, hash Argon2id e segredo do 2FA cifrado;
  - sessão, sem IP e sem navegador;
  - registros técnicos da API;
  - trilha de auditoria;
  - chaves da Binance cifradas;
  - tokens de API, guardados só como hash;
  - operações e carteira;
  - renda fixa;
  - Open Finance (Pluggy): só itens e investimentos;
  - imóveis;
  - base de conhecimento;
  - conversas do assistente;
  - custo de IA;
  - avisos;
  - preferências no navegador.
- **Bases legais (art. 7º):**
  - execução de contrato ou procedimentos a pedido do titular (V);
  - consentimento para o Open Finance (I);
  - legítimo interesse e exercício regular de direitos para segurança (IX e VI);
  - obrigação legal quando houver (II).
- **Compartilhamento:**
  - Binance;
  - Pluggy;
  - Anthropic, pela API ou pelo Claude Code da conta de plano;
  - Voyage AI, ou Ollama local;
  - Telegram e e-mail pelo n8n;
  - Banco Central e brapi.dev, sem dado pessoal;
  - sites dos links do conhecimento;
  - quem hospeda o servidor.
- **Transferência internacional:** art. 33, IX, com o art. 7º, V.
- **Retenção**, por categoria.
- **Direitos** (art. 18) e prazo (art. 19).
- **Segurança:** RLS, AES-256-GCM, Argon2id, 2FA, reautenticação, CSRF, CSP, limite de tentativas e auditoria encadeada por hash.
- **Cookies:** só `zt_sessao` e `zt_csrf`, mais o `localStorage` de preferências. Sem análise de audiência nem rastreamento, por isso **não há banner de cookies**. Se você acrescentar qualquer ferramenta de análise ou terceiro no navegador, isso deixa de ser verdade: a política e o consentimento precisam mudar.
- **Crianças:** o serviço não é para menores de 18 anos.

## O que depende de você

- **Logs.** A API registra, por pedido, método, caminho, status, tempo e o IP de origem que enxerga. Atrás do nginx do Docker, esse IP é o do container, não o do visitante, porque a API não confia no proxy. Configure a rotação dos logs do Docker (por exemplo, `max-size` e `max-file` no `daemon.json`) e um prazo curto.
- **Backups.** Eles copiam todos os dados pessoais. Cifre, restrinja o acesso e defina por quanto tempo guarda (veja [operacao.md](operacao.md#backups)).
- **Alertas.** O Telegram e o e-mail são um destino por instalação. Numa instância com várias pessoas, todas recebem no mesmo chat os alertas e o relatório de todas. Avise as pessoas ou use uma instância por pessoa.
- **Provedor de IA e embeddings.** Com `EMBEDDINGS_PROVEDOR=ollama` ou `nenhum` (busca só por palavras) e sem assistente, o texto da base de conhecimento não sai do servidor. Pelo Claude Code, o conteúdo vai sob os termos da conta de plano que fez o login: se a conta é sua, e não da pessoa, diga isso a ela.
- **Pluggy.** Desconectar na tela apaga a conexão só no ZenTrade. A revogação na Pluggy e no banco é feita lá.
- **Incidentes.** Se houver incidente que possa causar risco ou dano relevante, comunique a ANPD e as pessoas afetadas (art. 48).

## Pedidos de titulares

Responda pelo e-mail do controlador. A confirmação e o acesso simplificado saem na hora; a declaração completa, em até 15 dias (art. 19). Confirme a identidade antes de entregar dados.

- **Acesso e portabilidade:** ainda não há exportação na tela. Extraia do banco as linhas da pessoa (`usuario_id`) em JSON ou CSV.
- **Correção:** nome e e-mail se mudam no banco, na tabela `usuarios`, porque ainda não há tela de perfil.
- **Eliminação:** a própria pessoa apaga na tela conversas, documentos, renda fixa, imóveis, chaves da corretora, tokens e conexões com bancos. **Ainda não há comando para excluir a conta inteira**, e um `DELETE` em `usuarios` falha, de propósito:
  - a trilha de auditoria não pode ser alterada nem apagada, e prende a pessoa por chave estrangeira;
  - as versões de estratégia também são imutáveis.

  Até existir o comando (está em "O que falta", no README), o caminho é este:
  1. Apague o que a tela permite.
  2. Revogue as sessões e os tokens.
  3. Troque nome e e-mail em `usuarios` por valores neutros e invalide a senha e o 2FA.
  4. Registre o pedido.

  A auditoria fica guardada como registro de segurança. Ela pode conter o e-mail da pessoa nas aprovações (`porQuem`), e a política diz isso.

## Pontos de atenção encontrados no código

Pontos a acompanhar, conferidos em outubro de 2026:

- O e-mail de quem aprova uma decisão ou aceita uma divergência fica gravado em vários lugares:
  - na auditoria, que é imutável;
  - em `decisoes.decidida_por` e `divergencias_saldo.resolvida_por`;
  - no texto da explicação da divergência.
- O agente de IA, quando o Claude Code falha, registra no log a última linha da saída do CLI. Ela pode ser um trecho da resposta do modelo.
- O IP de quem acessa fica no log da API (interesse legítimo: segurança e limite de tentativas). Atrás do nginx do Docker, é o IP real: o nginx sobrescreve o `X-Forwarded-For` e a API só confia em proxy da rede privada (`API_PROXY_CONFIAVEL`).
- Não há exclusão de conta nem exportação de dados pela tela.
- Não há expurgo automático de conversas, decisões, ordens, avisos, custos de IA nem da base de conhecimento. Eles ficam enquanto a conta existir.
