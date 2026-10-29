import { Job } from '@shared/database'
import { readSettings } from '@shared/settings'
import { templateMessage, type TemplateMessage } from '@shared/templates'

const LIST_FORMAT = new Intl.ListFormat('pt-BR')

/** Os nomes como aparecem no modelo: "{{empresa}} e {{local}}". */
function variableList(names: readonly string[]) {
	return LIST_FORMAT.format(names.map(name => `{{${name}}}`))
}

/**
 * Os avisos do modelo preenchido para o Discord: o que usou o fallback e o que faltou. Sem fallback, a mensagem fica
 * com a marca (`[empresa]`) e o envio só sai pelo site, onde dá para completar o texto.
 */
export function templateNotes(message: Pick<TemplateMessage, 'fallbacks' | 'missing'>) {
	return [
		...(message.fallbacks.length > 0 ? [`ℹ️ A vaga não tem ${variableList(message.fallbacks)}: entrou o texto do fallback.`] : []),
		...(message.missing.length > 0
			? [
					`⚠️ A vaga não tem ${variableList(message.missing)}, e o modelo não tem fallback: complete o texto antes de enviar. O envio desta vaga fica no site (“entrar em contato”).`,
				]
			: []),
	]
}

/**
 * O modelo da pessoa preenchido para a vaga, com o perfil e as variáveis das configurações. Sem a vaga no banco
 * (botões antigos), só o cargo do card.
 */
export async function loadTemplateMessage(postId: string | null, title: string | null) {
	const [settings, profile, job] = await Promise.all([
		readSettings('message'),
		readSettings('profile'),
		postId ? Job.findOne({ postId }).lean() : null,
	])

	return templateMessage(settings, job ?? { title }, profile)
}
