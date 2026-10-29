import { GMAIL_APP_PASSWORDS_URL, smtpHostFor } from '@shared/contracts'

/**
 * Um provedor recomendado na conta de e-mail, com o caminho para a senha de app. O servidor e a porta não precisam ser
 * preenchidos: saem do domínio do e-mail (`smtpHostFor`), na 587. Para incluir outro que aceite senha de app (Zoho,
 * Brevo), basta um item aqui e o domínio dele em `SMTP_PROVIDER_HOSTS`.
 */
export type SmtpPreset = {
	id: string
	label: string
	/** O servidor dele, para reconhecer o usuário digitado. */
	host: string
	/** Onde criar a senha de app. */
	appPasswordsUrl: string
	/** O caminho até a página de senhas de app, para quem não usar o link. */
	appPasswordsPath: string
}

export const GMAIL_PRESET: SmtpPreset = {
	id: 'gmail',
	label: 'Gmail',
	host: 'smtp.gmail.com',
	appPasswordsUrl: GMAIL_APP_PASSWORDS_URL,
	appPasswordsPath: 'Conta Google › Segurança › Senhas de app',
}

export const SMTP_PRESETS = [GMAIL_PRESET]

/** A escolha no topo da conta de e-mail: um dos provedores recomendados ou "outro provedor". */
export type SmtpProviderChoice = SmtpPreset['id'] | 'other'

/** O provedor recomendado do usuário digitado (`ana@gmail.com` → Gmail), ou `null`. */
export function smtpPresetOf(user: string) {
	const host = smtpHostFor(user)
	return SMTP_PRESETS.find(preset => preset.host === host) ?? null
}

/**
 * A escolha ao abrir a conta: o provedor do usuário salvo, o Gmail (o recomendado) sem usuário ainda, ou "outro
 * provedor" quando o salvo é de outro lugar.
 */
export function initialSmtpProvider(values: { user?: string | null; host?: string | null }): SmtpProviderChoice {
	const user = values.user?.trim() ?? ''
	if (!user && !values.host?.trim()) return GMAIL_PRESET.id

	const preset = smtpPresetOf(user)
	return preset && (!values.host?.trim() || values.host.trim() === preset.host) ? preset.id : 'other'
}
