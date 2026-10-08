import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	escapeMarkdown,
	time,
	TimestampStyles,
	type MessageActionRowComponentBuilder,
} from 'discord.js'

import type { ProcessedJob } from '@shared/contracts'

import { CONTACT_BUTTON_PREFIX } from './contact-reply'

const WORK_MODE_LABELS = { remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial' } as const

// Cor da barra lateral do embed por modalidade: ajuda a diferenciar as vagas de relance
const WORK_MODE_COLORS = { remoto: 0x2ecc71, hibrido: 0x3498db, presencial: 0xe67e22 } as const
const DEFAULT_COLOR = 0x95a5a6

// Limites da API do Discord
const TITLE_MAX = 256
const FIELD_MAX = 1024
const SUMMARY_MAX = 400
const THREAD_NAME_MAX = 100
const CUSTOM_ID_MAX = 100
const FORUM_TAGS_MAX = 5

/** Mensagem da vaga: embed com os dados + botões (link do post e contato/currículo). */
export function buildJobCard(job: ProcessedJob) {
	return { embeds: [buildJobEmbed(job)], components: buildJobComponents(job) }
}

/** Nome do post quando o canal é um fórum: "Cargo · Empresa". */
export function buildThreadName(job: ProcessedJob) {
	const name = [job.title ?? 'Vaga sem título', job.company].filter(Boolean).join(' · ')

	return truncate(name, THREAD_NAME_MAX)
}

/**
 * Escolhe tags do fórum (no máximo 5) cujo nome bate com a modalidade ou com as tecnologias da vaga.
 * As tags precisam existir no fórum; o bot não cria tags.
 */
export function pickForumTags(job: ProcessedJob, availableTags: { id: string; name: string }[]) {
	const wanted = new Set([workModeLabel(job), ...(job.necessary_knowledge ?? [])].filter(Boolean).map(value => normalizeTag(value!)))

	return availableTags
		.filter(tag => wanted.has(normalizeTag(tag.name)))
		.slice(0, FORUM_TAGS_MAX)
		.map(tag => tag.id)
}

/** Resumo do post: primeiras linhas, sem o texto inteiro (ele continua acessível pelo link). */
export function summarizePost(text: string, max = SUMMARY_MAX) {
	const normalized = text
		.normalize('NFKC')
		.replace(/\n{2,}/g, '\n')
		.trim()

	return truncate(escapeMarkdown(normalized), max)
}

function buildJobEmbed(job: ProcessedJob) {
	const embed = new EmbedBuilder()
		.setTitle(truncate(job.title ?? 'Vaga sem título', TITLE_MAX))
		.setDescription(summarizePost(job.rawContent))
		.setColor(job.workMode ? WORK_MODE_COLORS[job.workMode] : DEFAULT_COLOR)
		.setFooter({ text: `Confiança da IA: ${Math.round(job.aiJobConfidence)}%` })

	if (isHttpUrl(job.link)) embed.setURL(job.link)
	if (job.author) embed.setAuthor({ name: truncate(`Publicado por ${job.author}`, TITLE_MAX) })
	if (job.postedAt) embed.setTimestamp(new Date(job.postedAt))

	for (const field of jobFields(job)) {
		if (field.value) embed.addFields({ name: field.name, value: truncate(field.value, FIELD_MAX), inline: field.inline })
	}

	return embed
}

/** Campos do embed; os sem valor são omitidos. */
function jobFields(job: ProcessedJob) {
	const postedAt = job.postedAt ? time(new Date(job.postedAt), TimestampStyles.RelativeTime) : null
	const skills = job.necessary_knowledge?.length ? job.necessary_knowledge.map(skill => `\`${skill}\``).join(' ') : null

	return [
		{ name: '🏢 Empresa', value: job.company, inline: true },
		{ name: '📍 Local', value: job.location, inline: true },
		{ name: '🏠 Modalidade', value: workModeLabel(job), inline: true },
		{ name: '🕒 Publicada', value: postedAt, inline: true },
		{ name: '📧 Contato', value: job.recruiter_email, inline: true },
		{ name: '🛠️ Conhecimentos', value: skills, inline: false },
	]
}

function buildJobComponents(job: ProcessedJob) {
	const buttons: ButtonBuilder[] = []

	if (isHttpUrl(job.link)) {
		buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Ver post').setEmoji('🔗').setURL(job.link))
	}

	// Com e-mail: contato + currículo ajustado. Sem e-mail: só o currículo (para se candidatar pelo link).
	const contactId = `${CONTACT_BUTTON_PREFIX}${job.postId}`

	if (contactId.length <= CUSTOM_ID_MAX) {
		const button = new ButtonBuilder().setStyle(ButtonStyle.Secondary).setCustomId(contactId)

		buttons.push(
			job.recruiter_email
				? button.setLabel('Contato do recrutador').setEmoji('📧')
				: button.setLabel('Gerar currículo').setEmoji('📄'),
		)
	}

	if (buttons.length === 0) return []

	return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons)]
}

function workModeLabel(job: Pick<ProcessedJob, 'workMode'>) {
	return job.workMode ? WORK_MODE_LABELS[job.workMode] : null
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
