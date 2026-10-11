# ADR 006 — n8n fora do núcleo

**Situação:** aceita · 2026-10

## Contexto

Notificações, aprovação pelo celular, coleta de notícias e relatórios mudam muito e variam de pessoa para pessoa (Telegram, e-mail, outro canal). Escrever tudo no núcleo aumenta o código que precisa ser auditado como se mexesse em dinheiro. O n8n resolve isso com fluxos visuais que cada um ajusta.

## Decisão

- O n8n roda **fora do núcleo** e conversa com a API só por **webhooks assinados** (HMAC-SHA256 de `"carimbo.corpo"`, cabeçalho `X-ZenTrade-Assinatura`, validade de 5 minutos) e por rotas REST com tokens de escopo.
- O n8n **não decide nem envia ordem**. O que ele pode: avisar, coletar notícias para o RAG, devolver a resposta de uma aprovação humana e **ligar** a parada total quando o motor some. Desligar a parada total exige uma pessoa reautenticada.
- Os fluxos são versionados em `infra/n8n/fluxos/` e testados por `tools/n8n-validacao` (estrutura, ausência de segredos, aderência ao contrato e HMAC idêntico ao de `@zentrade/contratos`).
- Segredos ficam em credenciais do n8n, nunca nos fluxos.

## Consequências

- Se o n8n cair, o robô continua sob o motor de risco. Propostas em modo sugerir expiram sem resposta; alertas e relatórios atrasam.
- Trocar Telegram por outro canal é editar um fluxo, sem mexer no núcleo.
- Há duas implementações do HMAC (TypeScript e os nós do n8n); os testes de equivalência impedem que divirjam.
- O n8n precisa de `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` para ler as variáveis de configuração; por isso ele deve ter um único editor.
