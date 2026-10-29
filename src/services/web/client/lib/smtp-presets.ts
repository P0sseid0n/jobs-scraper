import { isMicrosoftPersonalAccount, smtpHostFor } from '@shared/contracts'

/**
 * Um provedor recomendado na conta de e-mail (os passos da senha de app ficam no tutorial da conta). O servidor e a
 * porta não precisam ser preenchidos: saem do domínio do e-mail (`smtpHostFor`), na 587. Para incluir outro que aceite
 * senha de app (Zoho, Brevo), basta um item aqui e o domínio dele em `SMTP_PROVIDER_HOSTS`.
 */
export type SmtpPreset = {
	id: string
	label: string
	/** O servidor dele, para reconhecer o usuário digitado. */
	host: string
}

export const GMAIL_PRESET: SmtpPreset = {
	id: 'gmail',
	label: 'Gmail',
	host: 'smtp.gmail.com',
}

export const SMTP_PRESETS = [GMAIL_PRESET]

/** O servidor do Microsoft 365 (contas de trabalho ou escola), que não sai do domínio do e-mail. */
export const MICROSOFT_365_HOST = 'smtp.office365.com'

/**
 * A escolha no topo da conta de e-mail, a única da conta: o tutorial do e-mail mostra o caminho dela. Um dos provedores
 * recomendados, o Outlook de trabalho ou escola ou "outro provedor".
 */
export type SmtpProviderChoice = SmtpPreset['id'] | 'outlook' | 'other'

/** As opções da escolha, na ordem em que aparecem. */
export const SMTP_PROVIDER_OPTIONS: { id: SmtpProviderChoice; label: string }[] = [
	{ id: GMAIL_PRESET.id, label: `${GMAIL_PRESET.label} (recomendado)` },
	{ id: 'outlook', label: 'Outlook (trabalho)' },
	{ id: 'other', label: 'outro' },
]

/** O provedor recomendado do usuário digitado (`ana@gmail.com` → Gmail), ou `null`. */
export function smtpPresetOf(user: string) {
	const host = smtpHostFor(user)
	return SMTP_PRESETS.find(preset => preset.host === host) ?? null
}

/**
 * A escolha ao abrir a conta: o provedor do usuário salvo, o Gmail (o recomendado) sem usuário ainda, o Outlook numa
 * conta da Microsoft (a de trabalho, pelo servidor; a pessoal, para ver o aviso dela), ou "outro provedor" quando o
 * salvo é de outro lugar.
 */
export function initialSmtpProvider(values: { user?: string | null; host?: string | null }): SmtpProviderChoice {
	const user = values.user?.trim() ?? ''
	const host = values.host?.trim() ?? ''
	if (!user && !host) return GMAIL_PRESET.id
	if (host.toLowerCase() === MICROSOFT_365_HOST || isMicrosoftPersonalAccount({ user, host })) return 'outlook'

	const preset = smtpPresetOf(user)
	return preset && (!values.host?.trim() || values.host.trim() === preset.host) ? preset.id : 'other'
}
