# ✉️ mailer

Envia a candidatura por e-mail para o recrutador, com o currículo ajustado em PDF anexado, quando alguém confirma o envio no site ou no Discord.

[← voltar ao README principal](../../../README.md)

## Como funciona

1. O canal (site ou Discord) mostra a prévia do e-mail e, **só depois da confirmação de quem clicou**, registra o envio na coleção `application_mails` (status `sending`) e publica um `MailRequest` na fila `mailer`: destinatário, assunto, corpo, a referência ao PDF (`attachment.fileId`, coleção `cv_files`) e o `replyTo`.
2. O mailer lê a conta de e-mail em uso, monta a mensagem (`compose-mail.ts`), envia pelo provedor e atualiza o registro (`sent` ou `failed`, com o motivo).
3. Enviada, a vaga fica marcada como candidatura enviada (`appliedAt`), e o site é avisado pela fila `web-applied`.
4. O resultado (`MailResult`) volta na fila de `replyTo` (`web-mail` ou `discord-mail`), com o contexto de quem pediu, como o cv-updater faz com os currículos.

Uma mensagem entregue de novo pela fila para um envio já feito só repete o resultado: o e-mail não sai duas vezes. Antes de enviar para uma vaga que já recebeu candidatura, os canais avisam e pedem a confirmação de novo.

## Erros

`mail-errors.ts` classifica a falha do provedor:

| Falha | O que acontece |
| --- | --- |
| Rede, tempo esgotado, servidor fora, resposta SMTP 4xx | volta para a fila (`mailer.retry`, com backoff); na última tentativa, vira falha |
| Login recusado (`EAUTH`, 530/534/535) | falha na hora e vai para a `mailer.dlq` |
| Endereço ou mensagem recusados (resposta SMTP 5xx) | falha na hora e vai para a `mailer.dlq` |

A falha aparece no canal com o motivo, e o envio pode ser tentado de novo ("tentar de novo" no site, "🔁 Tentar de novo" no Discord). Sem resposta do mailer em 10 minutos, os canais dão o envio como falho.

## Provedor

O envio fica atrás da interface `MailTransport` (`mail-transport.ts`): hoje é SMTP (nodemailer), que funciona com Gmail, Outlook e afins usando senha de app. Para trocar por uma API (Resend, SES), basta outra implementação de `send` e `verify`.

## Configuração

A conta de e-mail é um grupo das [credenciais](../../shared/README.md#credenciais) (`smtp`): no site, em Configurações › Contas › E-mail (ou no passo "E-mail" do onboarding, com o botão "testar", que faz o login sem enviar nada), ou no `.env`:

| Variável | O que é |
| --- | --- |
| `SMTP_HOST` | opcional no Gmail, Outlook, Yahoo e iCloud: vazio, sai do domínio do `SMTP_USER` (`SMTP_PROVIDER_HOSTS`, em `contracts/settings.ts`); nos outros, o servidor (ex.: `smtp.empresa.com.br`) |
| `SMTP_PORT` | opcional: 587 (STARTTLS) por padrão; 465 para TLS direto |
| `SMTP_USER`, `SMTP_PASS` | usuário e senha (de app, no Gmail e no Outlook) |
| `MAIL_FROM` | opcional: remetente (`Nome <email>`); vazio usa o nome do currículo base (o feito pelo formulário) com o `SMTP_USER`, ou só o `SMTP_USER` |

A conta é relida a cada envio: a salva pelo site vale sem reiniciar. Sem conta, o envio fica desligado: os botões não aparecem (o site diz onde configurar) e o resto funciona como antes. A senha nunca vai para os logs, e nos logs `info` ficam só os IDs: o endereço e o texto do e-mail ficam de fora.

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `index.ts` | consome a fila `mailer` e liga o envio ao banco e às filas |
| `send-application.ts` | o envio: idempotência, retry × DLQ e o resultado para quem pediu |
| `compose-mail.ts` | monta o e-mail (assunto numa linha, corpo e o PDF anexado) |
| `mail-errors.ts` | classifica as falhas do provedor (transitória × permanente) |
| `mail-transport.ts` | a interface do provedor e a implementação SMTP |
