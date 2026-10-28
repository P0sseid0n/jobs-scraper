import type { MailRequest } from '@shared/contracts'

import type { OutgoingMail } from './mail-transport'

/** O PDF anexado à candidatura. */
export type MailAttachmentFile = { fileName: string; pdf: Buffer }

/**
 * Monta o e-mail da candidatura: o assunto e o corpo revisados por quem clicou, do remetente da conta, com o currículo
 * em PDF anexado. O texto vai como está (a assinatura já está no corpo); as quebras de linha viram CRLF, como pede o SMTP.
 */
export function composeMail(
	request: Pick<MailRequest, 'to' | 'subject' | 'body'>,
	file: MailAttachmentFile,
	from: string,
): OutgoingMail {
	return {
		from,
		to: request.to,
		// O contrato já tira as quebras; aqui de novo porque uma quebra no cabeçalho estragaria o e-mail
		subject: request.subject.replace(/[\r\n]+/g, ' ').trim(),
		text: request.body.replace(/\r?\n/g, '\r\n'),
		attachments: [{ filename: file.fileName, content: file.pdf, contentType: 'application/pdf' }],
	}
}
