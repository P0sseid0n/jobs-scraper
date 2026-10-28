# 🤖 discord-bot

Publica cada vaga nova num canal do Discord e entrega o currículo ajustado para quem pedir.

[← voltar ao README principal](../../../README.md)

## Vagas

Cada vaga vira um card (embed) com cargo, empresa, local, modalidade, regime de contratação, data, tecnologias e botões para o post e para o contato do recrutador. Se o post tem imagem, a primeira aparece no card, enviada como anexo (lida da coleção `job_images`: a URL do LinkedIn expira). O canal é o configurado em Configurações › Contas (ou `DISCORD_CHANNEL_ID`):

- **Canal de texto:** cada vaga vira uma mensagem.
- **Canal de fórum:** cada vaga vira um post próprio, com as tags do fórum que batem com a modalidade, o regime ou as tecnologias. Crie no fórum tags como "Remoto", "PJ" ou "Vue".

## Candidatura enviada

O botão "☑️ Já me candidatei" marca a vaga no banco (`appliedAt`, o mesmo campo do site) e vira "✅ Candidatura enviada"; outro clique desmarca. O estado do banco decide, então o clique funciona mesmo depois de a vaga ser marcada ou desmarcada no site. O bot avisa o site pela fila `web-applied`, e a vaga sai da lista de lá (o filtro "esconder candidaturas enviadas").

## Currículo

O botão "📧 Contato do recrutador" (ou "📄 Gerar currículo", quando a vaga não tem e-mail) responde só para quem clicou, com o contato. O pedido vai para o [cv-updater](../cv-updater/README.md) e, segundos depois, chega o PDF do currículo ajustado à vaga. Quando a vaga tem e-mail, vem junto uma mensagem de candidatura escrita para ela.

O pedido guarda no contexto o token da interação do Discord, e o resultado volta pela fila `discord-cv`.

## Enviar a candidatura por e-mail

Com e-mail de contato na vaga e a conta de e-mail (SMTP) configurada no site ou no `.env`, a resposta com o currículo traz o botão "✉️ Enviar candidatura". Ele mostra, só para quem clicou, o e-mail como vai sair (para quem, assunto, corpo e o PDF anexo) e só envia com "📤 Confirmar envio"; "Cancelar" descarta. Se a vaga já recebeu candidatura por e-mail (pelo site ou pelo Discord), a confirmação avisa antes, e o botão vira "Enviar de novo".

O currículo entregue fica guardado na coleção `cv_files` (30 dias), com a mensagem sugerida, e o pedido vai para o [mailer](../mailer/README.md) com o `fileId`. O resultado volta pela fila `discord-mail` e aparece na própria confirmação: enviada, ou o motivo da falha com "🔁 Tentar de novo". Para mudar o texto antes de enviar, use o site.

## Variáveis

`DISCORD_TOKEN` e `DISCORD_CHANNEL_ID`, documentadas no `.env.example`. Também dá para informar pelo site (Configurações › Contas), e o salvo lá vale no lugar do `.env` ([ordem de leitura](../../shared/README.md#credenciais)). O bot relê as credenciais a cada 30 s e reconecta quando mudam. Sem credenciais, ele fica no ar em espera e descarta as mensagens com um log: as vagas ficam só no site e não se acumulam na fila para sair todas de uma vez quando alguém configurar. Com um token ou canal recusado, ele espera outras credenciais, e as vagas esperam na fila. Por isso o bot usa o MongoDB.

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `job-publisher.ts` | escolhe o canal (texto ou fórum) e envia o card |
| `job-card.ts` | card (embed) da vaga |
| `contact-button.ts`, `contact-reply.ts` | clique no botão de contato e o texto da resposta |
| `applied-button.ts` | clique no "Já me candidatei" (marca e desmarca a candidatura) |
| `cv-delivery.ts` | envio do PDF e da mensagem de candidatura (com o botão "Enviar candidatura") |
| `mail-button.ts`, `mail-reply.ts` | a confirmação do envio por e-mail e o pedido ao mailer |
| `mail-delivery.ts` | o resultado do envio na confirmação |
