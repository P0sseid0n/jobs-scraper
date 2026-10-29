/** E-mail de candidatura: o assunto e o corpo (o mesmo formato do `ApplicationMessage` dos contratos). */
export type ApplicationMessageText = { subject: string; body: string }

/** O e-mail como um texto só, para onde não dá para copiar em partes (Discord): "Assunto: …", uma linha em branco e o corpo. */
export function formatApplicationMessage(message: ApplicationMessageText) {
	return `Assunto: ${message.subject}\n\n${message.body}`
}
