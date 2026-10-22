# 🤖 discord-bot

Publica cada vaga nova num canal do Discord e entrega o currículo ajustado para quem pedir.

[← voltar ao README principal](../../../README.md)

## Vagas

Cada vaga vira um card (embed) com cargo, empresa, local, modalidade, regime de contratação, data, tecnologias e botões para o post e para o contato do recrutador. O canal é o configurado em Configurações › Contas (ou `DISCORD_CHANNEL_ID`):

- **Canal de texto:** cada vaga vira uma mensagem.
- **Canal de fórum:** cada vaga vira um post próprio, com as tags do fórum que batem com a modalidade, o regime ou as tecnologias. Crie no fórum tags como "Remoto", "PJ" ou "Vue".

## Currículo

O botão "📧 Contato do recrutador" (ou "📄 Gerar currículo", quando a vaga não tem e-mail) responde só para quem clicou, com o contato. O pedido vai para o [cv-updater](../cv-updater/README.md) e, segundos depois, chega o PDF do currículo ajustado à vaga. Quando a vaga tem e-mail, vem junto uma mensagem de candidatura escrita para ela.

O pedido guarda no contexto o token da interação do Discord, e o resultado volta pela fila `discord-cv`.

## Variáveis

`DISCORD_TOKEN` e `DISCORD_CHANNEL_ID`, documentadas no `.env.example`. Também dá para informar pelo site (Configurações › Contas), e o salvo lá vale no lugar do `.env` ([ordem de leitura](../../shared/README.md#credenciais)). O bot relê as credenciais a cada 30 s e reconecta quando mudam. Sem credenciais, ou com um token ou canal recusado, ele fica no ar esperando outras, e as vagas esperam na fila. Por isso o bot usa o MongoDB.

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `job-publisher.ts` | escolhe o canal (texto ou fórum) e envia o card |
| `job-card.ts` | card (embed) da vaga |
| `contact-button.ts`, `contact-reply.ts` | clique no botão de contato e o texto da resposta |
| `cv-delivery.ts` | envio do PDF e da mensagem de candidatura |
