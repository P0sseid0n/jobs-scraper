import type { ContractType, ProcessedJob } from '../contracts/job'

/**
 * Os dados da vaga que entram no compartilhamento: só os públicos, que servem a quem não tem o jobs-scraper. O
 * `rawContent` é o texto da vaga (o post, ou a página dela numa vaga de lista), de onde sai a descrição da imagem.
 */
export type ShareJob = Pick<
	ProcessedJob,
	| 'title'
	| 'company'
	| 'location'
	| 'workMode'
	| 'contractTypes'
	| 'necessaryKnowledge'
	| 'applyLink'
	| 'recruiterEmail'
	| 'postLink'
	| 'rawContent'
	| 'postedAt'
>

/** Quantas tecnologias aparecem; as outras viram "e mais N". */
export const SHARE_SKILLS_MAX = 5

/** Até onde vai a descrição da imagem; o card ainda corta em quantas linhas couberem. */
export const SHARE_DESCRIPTION_MAX = 600

// Os mesmos rótulos do card do Discord e do site
const WORK_MODE_LABELS = { remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial' } as const
const CONTRACT_TYPE_LABELS: Record<ContractType, string> = { clt: 'CLT', pj: 'PJ', estagio: 'Estágio', freelance: 'Freelance' }

const LIST_FORMAT = new Intl.ListFormat('pt-BR')

// A data do post no horário de Brasília (o dos posts), igual em qualquer máquina
const POSTED_AT_FORMAT = new Intl.DateTimeFormat('pt-BR', {
	day: '2-digit',
	month: '2-digit',
	year: 'numeric',
	timeZone: 'America/Sao_Paulo',
})

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

	const title = `*${jobTitle(job).replaceAll('*', '')}*`
	const details = [contractTypesLabel(job), job.workMode && WORK_MODE_LABELS[job.workMode], job.location?.trim()].filter(Boolean)
	const skills = jobSkills(job)

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

/** O que a imagem da vaga mostra, além dos dados: escolhido na modal de compartilhar. */
export type ShareCardOptions = {
	/** O QR code com o link da vaga (link não é clicável numa imagem). */
	qr: boolean
	skills: boolean
	description: boolean
}

/** Os dados que entram na imagem da vaga, prontos para desenhar: o card só mostra o que vem aqui. */
export type ShareCard = {
	title: string
	company: string | null
	contractTypes: string | null
	workMode: { value: NonNullable<ShareJob['workMode']>; label: string } | null
	location: string | null
	/** Até `SHARE_SKILLS_MAX`; `moreSkills` conta as que ficaram de fora. */
	skills: string[]
	moreSkills: number
	/** O texto da vaga, sem links nem hashtags, cortado com "…"; `null` desligado ou sem texto. */
	description: string | null
	/** "publicada em 27/10/2026": a data fixa, não "ontem", porque a imagem circula por dias; `null` se o post não tem. */
	postedAt: string | null
	/** Para onde o QR code leva e a legenda dele; sem link público (ou com o QR desligado), `null`. */
	qr: { link: string; caption: string } | null
}

/**
 * Os dados da imagem da vaga (status, stories, posts), com as regras do texto: os mesmos rótulos, as mesmas
 * tecnologias, só links públicos. O QR code leva à candidatura ou, sem ela, ao post original; o e-mail do recrutador
 * não entra, porque o QR é para abrir no celular.
 */
export function jobShareCard(job: ShareJob, options: ShareCardOptions): ShareCard {
	const applyLink = publicLink(job.applyLink)
	const postLink = publicLink(job.postLink)
	const skills = options.skills ? jobSkills(job) : []
	const qrLink = options.qr ? (applyLink ?? postLink) : null

	return {
		title: jobTitle(job),
		company: job.company?.trim() || null,
		contractTypes: contractTypesLabel(job),
		workMode: job.workMode ? { value: job.workMode, label: WORK_MODE_LABELS[job.workMode] } : null,
		location: job.location?.trim() || null,
		skills: skills.slice(0, SHARE_SKILLS_MAX),
		moreSkills: Math.max(skills.length - SHARE_SKILLS_MAX, 0),
		description: options.description ? jobDescription(job.rawContent) : null,
		postedAt: job.postedAt ? `publicada em ${POSTED_AT_FORMAT.format(new Date(job.postedAt))}` : null,
		qr: qrLink ? { link: qrLink, caption: qrLink === applyLink ? 'Candidate-se' : 'Ver vaga' } : null,
	}
}

/** O assunto do e-mail de compartilhamento: "Cargo — Empresa". */
export function jobShareSubject(job: Pick<ShareJob, 'title' | 'company'>) {
	return [jobTitle(job), job.company?.trim()].filter(Boolean).join(' — ')
}

/** O nome do PNG da imagem da vaga: "vaga-dev-backend-empresa-x.png", sem acentos nem símbolos. */
export function jobShareFileName(job: Pick<ShareJob, 'title' | 'company'>) {
	const slug = ['vaga', job.title, job.company]
		.filter(Boolean)
		.join(' ')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, FILE_NAME_MAX)
		.replace(/^-|-$/g, '')

	return `${slug}.png`
}

/** Até onde vai o nome do arquivo (sem o `.png`): um cargo enorme não vira um nome que o sistema corta. */
const FILE_NAME_MAX = 80

/** O cargo; sem ele, "Vaga". */
function jobTitle(job: Pick<ShareJob, 'title'>) {
	return job.title?.trim() || 'Vaga'
}

/** "CLT", ou "CLT ou PJ" quando o post aceita os dois; `null` se o post não diz. */
function contractTypesLabel(job: Pick<ShareJob, 'contractTypes'>) {
	return job.contractTypes?.length ? job.contractTypes.map(type => CONTRACT_TYPE_LABELS[type]).join(' ou ') : null
}

/** As tecnologias da vaga, sem as vazias (o campo vem da IA). */
function jobSkills(job: Pick<ShareJob, 'necessaryKnowledge'>) {
	return job.necessaryKnowledge?.map(skill => skill.trim()).filter(Boolean) ?? []
}

/**
 * A descrição da imagem a partir do texto da vaga: sem links (numa imagem não são clicáveis; o QR leva à vaga) nem
 * hashtags, sem linhas vazias repetidas e, acima do limite, cortada no fim de uma palavra com "…".
 */
function jobDescription(rawContent: string | null | undefined) {
	const text = (rawContent ?? '')
		.replace(/https?:\/\/\S+/gi, '')
		.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '$1')
		.split('\n')
		.map(line => line.replace(/[ \t]+/g, ' ').trim())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
	if (!text) return null
	if (text.length <= SHARE_DESCRIPTION_MAX) return text

	const cut = text.slice(0, SHARE_DESCRIPTION_MAX)
	const lastSpace = cut.search(/\s\S*$/)
	return `${cut.slice(0, lastSpace > 0 ? lastSpace : SHARE_DESCRIPTION_MAX).replace(/[\s.,;:!?-]+$/, '')}…`
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
