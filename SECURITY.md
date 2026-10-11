# Segurança

O ZenTrade lida com chaves de corretora e ordens com dinheiro. Leve falhas a sério — e nos conte em particular.

## Como reportar

Não abra issue pública. Use o recurso **Report a vulnerability** (aba Security do GitHub) com:

- o que você encontrou e como reproduzir;
- o impacto que você vê;
- se possível, uma sugestão de correção.

Respondemos em até 5 dias úteis.

## O que o projeto garante por desenho

- A IA nunca envia ordem: um motor de risco determinístico aprova ou barra cada proposta.
- Chaves de corretora ficam cifradas; peça à corretora uma chave **sem permissão de saque** e presa ao IP do servidor.
- Nenhum segredo vai para o repositório: a CI roda varredura de segredos em todo push.
