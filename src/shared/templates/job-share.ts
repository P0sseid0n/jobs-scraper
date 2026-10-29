import type { ContractType, ProcessedJob } from '../contracts/job'

/** Os dados da vaga que entram no texto de compartilhamento: só os públicos, que servem a quem não tem o jobs-scraper. */
export type ShareJob = Pick<
	ProcessedJob,
	'title' | 'company' | 'location' | 'workMode' | 'contractTypes' | 'necessaryKnowledge' | 'applyLink' | 'recruiterEmail' | 'postLink'
>

/** Quantas tecnologias aparecem; as outras viram "e mais N". */
export const SHARE_SKILLS_MAX = 5

// Os mesmos rótulos do card do Discord e do site
const WORK_MODE_LABELS = { remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial' } as const
const CONTRACT_TYPE_LABELS: Record<ContractType, string> = { clt: 'CLT', pj: 'PJ', estagio: 'Estágio', freelance: 'Freelance' }

const LIST_FORMAT = new Intl.ListFormat('pt-BR')

/**
 * O texto para indicar a vaga a alguém (WhatsApp, e-mail, outro app): o cargo em `*negrito*` (o do WhatsApp, que nos
 * outros apps fica só com os asteriscos), a empresa, regime, modalidade e local, as principais tecnologias, como se
 * candidatar (o link; sem ele, o e-mail do recrutador) e o post original. Os campos vazios não aparecem, e nenhum link
 * aponta para o próprio jobs-scraper.
 */
export function jobShareText(job: ShareJob) {
	const applyLink = publicLink(job.applyLink)
	const postLink = publicLink(job.postLink)
	const recruiterEmail = job.recruiterEmail?.trim()

	const title = `*${(job.title?.trim() || 'Vaga').replaceAll('*', '')}*`
	const contractTypes = job.contractTypes?.length ? job.contractTypes.map(type => CONTRACT_TYPE_LABELS[type]).join(' ou ') : null
	const details = [contractTypes, job.workMode && WORK_MODE_LABELS[job.workMode], job.location?.trim()].filter(Boolean)
	const skills = job.necessaryKnowledge?.map(skill => skill.trim()).filter(Boolean) ?? []

	const about = [
		job.company?.trim() ? `${title} — ${job.company.trim()}` : title,
		details.length > 0 && details.join(' · '),
		skills.length > 0 && `Tecnologias: ${skillList(skills)}`,
	]
	const links = [
		applyLink ? `Candidatura: ${applyLink}` : recruiterEmail && `Candidatura: envie o currículo para ${recruiterEmail}`,
		postLink && `Post original: ${postLink}`,
	]

	return [about, links]
		.map(lines => lines.filter(Boolean).join('\n'))
		.filter(Boolean)
		.join('\n\n')
}

/** O assunto do e-mail de compartilhamento: "Cargo — Empresa". */
export function jobShareSubject(job: Pick<ShareJob, 'title' | 'company'>) {
	return [job.title?.trim() || 'Vaga', job.company?.trim()].filter(Boolean).join(' — ')
}

/** "React, TypeScript e Node.js"; acima do limite, "React, …, Docker e mais 3". */
function skillList(skills: string[]) {
	const rest = skills.length - SHARE_SKILLS_MAX
	if (rest <= 0) return LIST_FORMAT.format(skills)

	return `${skills.slice(0, SHARE_SKILLS_MAX).join(', ')} e mais ${rest}`
}

/** Só links http(s) de fora (o campo vem da IA): nada de `localhost` nem de IP da rede local. */
function publicLink(link: string | null) {
	if (!link || !/^https?:\/\//i.test(link.trim())) return null

	try {
		const { hostname } = new URL(link.trim())
		return LOCAL_HOST.test(hostname) ? null : link.trim()
	} catch {
		return null
	}
}

const LOCAL_HOST =
	/^(localhost|.*\.localhost|.*\.local|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[.*\])$/i
