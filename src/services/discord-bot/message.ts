import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	escapeMarkdown,
	type MessageActionRowComponentBuilder,
	TimestampStyles,
	time,
} from 'discord.js'
import type { ProcessedJob } from '../../types/messages'

export const CONTACT_BUTTON_PREFIX = 'contact:'

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

function truncate(text: string, max: number) {
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export function workModeLabel(job: Pick<ProcessedJob, 'workMode'>) {
	return job.workMode ? WORK_MODE_LABELS[job.workMode] : null
}

/** Resumo do post: primeiras linhas, sem o texto inteiro (ele continua acessível pelo link). */
export function summarize(text: string, max = SUMMARY_MAX) {
	const normalized = text
		.normalize('NFKC')
		.replace(/\n{2,}/g, '\n')
		.trim()
	return truncate(escapeMarkdown(normalized), max)
}

function isHttpUrl(value: string | null): value is string {
	return !!value && /^https?:\/\//i.test(value)
}

export function buildJobEmbed(job: ProcessedJob) {
	const embed = new EmbedBuilder()
		.setTitle(truncate(job.title ?? 'Vaga sem título', TITLE_MAX))
		.setDescription(summarize(job.rawContent))
		.setColor(job.workMode ? WORK_MODE_COLORS[job.workMode] : DEFAULT_COLOR)
		.setFooter({ text: `Confiança da IA: ${Math.round(job.aiJobConfidence)}%` })

	if (isHttpUrl(job.link)) embed.setURL(job.link)
	if (job.author) embed.setAuthor({ name: truncate(`Publicado por ${job.author}`, TITLE_MAX) })
	if (job.postedAt) embed.setTimestamp(new Date(job.postedAt))

	const fields = [
		{ name: '🏢 Empresa', value: job.company, inline: true },
		{ name: '📍 Local', value: job.location, inline: true },
		{ name: '🏠 Modalidade', value: workModeLabel(job), inline: true },
		{
			name: '🕒 Publicada',
			value: job.postedAt ? time(new Date(job.postedAt), TimestampStyles.RelativeTime) : null,
			inline: true,
		},
		{ name: '📧 Contato', value: job.recruiter_email, inline: true },
		{
			name: '🛠️ Conhecimentos',
			value: job.necessary_knowledge?.length ? job.necessary_knowledge.map(skill => `\`${skill}\``).join(' ') : null,
			inline: false,
		},
	]

	for (const field of fields) {
		if (field.value) embed.addFields({ name: field.name, value: truncate(field.value, FIELD_MAX), inline: field.inline })
	}

	return embed
}

export function buildJobComponents(job: ProcessedJob) {
	const buttons: ButtonBuilder[] = []

	if (isHttpUrl(job.link)) {
		buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Ver post').setEmoji('🔗').setURL(job.link))
	}

	const contactId = job.recruiter_email ? `${CONTACT_BUTTON_PREFIX}${job.recruiter_email}` : null
	if (contactId && contactId.length <= CUSTOM_ID_MAX) {
		buttons.push(
			new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel('Contato do recrutador').setEmoji('📧').setCustomId(contactId),
		)
	}

	return buttons.length > 0 ? [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons)] : []
}

export function buildJobMessage(job: ProcessedJob) {
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
	const normalize = (value: string) =>
		value
			.normalize('NFD')
			.replace(/\p{Diacritic}/gu, '')
			.toLowerCase()
			.replace(/\.js$/, '')
			.trim()
	const wanted = new Set([workModeLabel(job), ...(job.necessary_knowledge ?? [])].filter(Boolean).map(value => normalize(value!)))

	return availableTags
		.filter(tag => wanted.has(normalize(tag.name)))
		.slice(0, 5)
		.map(tag => tag.id)
}

/** Texto da resposta (visível só para quem clicou) ao botão de contato. */
export function buildContactReply(email: string, jobTitle: string | null) {
	const role = jobTitle ?? 'a vaga'
	return [
		`📧 **E-mail do recrutador:** ${email}`,
		'',
		'Modelo de mensagem para copiar:',
		'```',
		`Assunto: Candidatura – ${role}`,
		'',
		'Olá! Tudo bem?',
		'',
		`Vi a publicação sobre ${role} no LinkedIn e tenho interesse na oportunidade.`,
		'Envio em anexo meu currículo e fico à disposição para conversarmos.',
		'',
		'Obrigado!',
		'```',
	].join('\n')
}
