import {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	escapeMarkdown,
	time,
	TimestampStyles,
	type MessageActionRowComponentBuilder,
} from 'discord.js'

import {
	EXTRACTION_CHECK_LABELS,
	EXTRACTION_CHECKS,
	type JobPublished,
	type PostImageType,
	type ProcessedJob,
} from '@shared/contracts'

import { CONTACT_BUTTON_PREFIX } from './contact-reply'

const WORK_MODE_LABELS = { remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial' } as const
const CONTRACT_TYPE_LABELS = { clt: 'CLT', pj: 'PJ', estagio: 'Estágio', freelance: 'Freelance' } as const

// Cor da barra lateral do embed por modalidade: ajuda a diferenciar as vagas de relance
const WORK_MODE_COLORS = { remoto: 0x2ecc71, hibrido: 0x3498db, presencial: 0xe67e22 } as const
const DEFAULT_COLOR = 0x95a5a6
// Vaga que pede para conferir o post original (muitos checks da extração): a barra fica vermelha
const REVIEW_COLOR = 0xe74c3c

// Limites da API do Discord
const TITLE_MAX = 256
const FIELD_MAX = 1024
const SUMMARY_MAX = 400
const THREAD_NAME_MAX = 100
const CUSTOM_ID_MAX = 100
const FORUM_TAGS_MAX = 5

/** A primeira imagem do post, guardada pelo post-processing. */
export type JobCardImage = { mimeType: PostImageType; data: Buffer }

const IMAGE_EXTENSIONS: Record<PostImageType, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
}

/**
 * Monta a mensagem da vaga: embed com os dados e botões de link e contato/currículo. A imagem do post vai como anexo
 * (a URL do LinkedIn expira) e aparece no embed.
 */
export function buildJobCard(job: JobPublished, image: JobCardImage | null = null) {
	const embed = buildJobEmbed(job)
	const files: AttachmentBuilder[] = []

	if (image) {
		const name = `vaga.${IMAGE_EXTENSIONS[image.mimeType]}`
		embed.setImage(`attachment://${name}`)
		files.push(new AttachmentBuilder(image.data, { name }))
	}

	return { embeds: [embed], components: buildJobComponents(job), files }
}

/** Monta o nome do post no fórum: "Cargo · Empresa". */
export function buildThreadName(job: ProcessedJob) {
	const name = [job.title ?? 'Vaga sem título', job.company].filter(Boolean).join(' · ')

	return truncate(name, THREAD_NAME_MAX)
}

/** Escolhe até 5 tags existentes no fórum que batem com a modalidade, o regime ou as tecnologias da vaga. */
export function pickForumTags(job: ProcessedJob, availableTags: { id: string; name: string }[]) {
	const contractTypes = (job.contractTypes ?? []).map(type => CONTRACT_TYPE_LABELS[type])
	const wanted = new Set(
		[workModeLabel(job), ...contractTypes, ...(job.necessaryKnowledge ?? [])].filter(Boolean).map(value => normalizeTag(value!)),
	)

	return availableTags
		.filter(tag => wanted.has(normalizeTag(tag.name)))
		.slice(0, FORUM_TAGS_MAX)
		.map(tag => tag.id)
}

/** Resume o post nas primeiras linhas; o texto inteiro continua acessível pelo link. */
export function summarizePost(text: string, max = SUMMARY_MAX) {
	const normalized = text
		.normalize('NFKC')
		.replace(/\n{2,}/g, '\n')
		.trim()

	return truncate(escapeMarkdown(normalized), max)
}

function buildJobEmbed(job: JobPublished) {
	const embed = new EmbedBuilder()
		.setTitle(truncate(job.title ?? 'Vaga sem título', TITLE_MAX))
		.setDescription(summarizePost(job.rawContent))
		.setColor(jobColor(job))

	const checks = checksFooter(job)
	if (checks) embed.setFooter({ text: checks })

	const titleUrl = isHttpUrl(job.postLink) ? job.postLink : isHttpUrl(job.applyLink) ? job.applyLink : null
	if (titleUrl) embed.setURL(titleUrl)
	if (job.author) embed.setAuthor({ name: truncate(`Publicado por ${job.author}`, TITLE_MAX) })
	if (job.postedAt) embed.setTimestamp(new Date(job.postedAt))

	for (const field of jobFields(job)) {
		if (field.value) embed.addFields({ name: field.name, value: truncate(field.value, FIELD_MAX), inline: field.inline })
	}

	return embed
}

/** Lista os campos do embed (os vazios são omitidos ao montar). */
function jobFields(job: ProcessedJob) {
	const postedAt = job.postedAt ? time(new Date(job.postedAt), TimestampStyles.RelativeTime) : null
	const skills = job.necessaryKnowledge?.length ? job.necessaryKnowledge.map(skill => `\`${skill}\``).join(' ') : null

	return [
		{ name: '🏢 Empresa', value: job.company, inline: true },
		{ name: '📍 Local', value: job.location, inline: true },
		{ name: '🏠 Modalidade', value: workModeLabel(job), inline: true },
		{ name: '📄 Regime', value: contractTypesLabel(job), inline: true },
		{ name: '🕒 Publicada', value: postedAt, inline: true },
		{ name: '📧 Contato', value: job.recruiterEmail, inline: true },
		{ name: '🛠️ Conhecimentos', value: skills, inline: false },
	]
}

function buildJobComponents(job: ProcessedJob) {
	const buttons: ButtonBuilder[] = []

	// Primeiro as formas de candidatura (site, contato); o post vai por último, porque serve mais para conferir
	if (isHttpUrl(job.applyLink)) {
		buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Candidatar-se').setEmoji('📝').setURL(job.applyLink))
	}

	// Com e-mail: contato + currículo ajustado. Sem e-mail: só o currículo (para se candidatar pelo link).
	const contactId = `${CONTACT_BUTTON_PREFIX}${job.postId}`

	if (contactId.length <= CUSTOM_ID_MAX) {
		const button = new ButtonBuilder().setStyle(ButtonStyle.Secondary).setCustomId(contactId)

		buttons.push(
			job.recruiterEmail
				? button.setLabel('Contato do recrutador').setEmoji('📧')
				: button.setLabel('Gerar currículo').setEmoji('📄'),
		)
	}

	if (isHttpUrl(job.postLink)) {
		buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Ver post').setEmoji('🔗').setURL(job.postLink))
	}

	if (buttons.length === 0) return []

	return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons)]
}

function jobColor(job: Pick<JobPublished, 'workMode' | 'needsReview'>) {
	if (job.needsReview) return REVIEW_COLOR
	return job.workMode ? WORK_MODE_COLORS[job.workMode] : DEFAULT_COLOR
}

/** "⚠ 2/6 · a IA citou o que não está no post: modalidade, tecnologias"; `null` sem checks. */
function checksFooter(job: Pick<JobPublished, 'extractionChecks' | 'needsReview'>) {
	if (job.extractionChecks.length === 0) return null

	const labels = job.extractionChecks.map(check => EXTRACTION_CHECK_LABELS[check]).join(', ')
	const text = `⚠ ${job.extractionChecks.length}/${EXTRACTION_CHECKS.length} · a IA citou o que não está no post: ${labels}`
	return job.needsReview ? `${text}. Confira o post original e reporte a vaga no site.` : text
}

function workModeLabel(job: Pick<ProcessedJob, 'workMode'>) {
	return job.workMode ? WORK_MODE_LABELS[job.workMode] : null
}

/** "CLT", ou "CLT ou PJ" quando o post aceita os dois. */
function contractTypesLabel(job: Pick<ProcessedJob, 'contractTypes'>) {
	return job.contractTypes?.length ? job.contractTypes.map(type => CONTRACT_TYPE_LABELS[type]).join(' ou ') : null
}

function isHttpUrl(value: string | null): value is string {
	return !!value && /^https?:\/\//i.test(value)
}

function truncate(text: string, max: number) {
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function normalizeTag(value: string) {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/\.js$/, '')
		.trim()
}
