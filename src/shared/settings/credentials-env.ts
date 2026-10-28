import { z } from 'zod'

import { CredentialsSchema, type CredentialGroup, type Credentials } from '../contracts/settings'

/** Variável opcional: vazia conta como não informada. */
const optional = z
	.string()
	.trim()
	.optional()
	.transform(value => value || undefined)

/**
 * As credenciais no `.env`. Todo serviço com banco as lê ao subir e as guarda em memória (`setEnvCredentials`), sem
 * gravar no banco: valem para cada grupo que não foi salvo pelo site.
 */
export const credentialsEnv = {
	LINKEDIN_EMAIL: optional,
	// A senha não perde espaços nas pontas: eles podem fazer parte dela
	LINKEDIN_PASSWORD: z
		.string()
		.optional()
		.transform(value => value || undefined),
	LINKEDIN_LI_AT: optional,
	DISCORD_TOKEN: optional,
	DISCORD_CHANNEL_ID: optional,
	GITHUB_USERNAME: optional,
	GITHUB_TOKEN: optional,
	SMTP_HOST: optional,
	SMTP_PORT: optional,
	SMTP_USER: optional,
	SMTP_PASS: z
		.string()
		.optional()
		.transform(value => value || undefined),
	MAIL_FROM: optional,
}

export type CredentialsEnv = z.infer<z.ZodObject<typeof credentialsEnv>>

/** A variável de cada campo, para as mensagens de erro apontarem o que corrigir no `.env`. */
const ENV_NAMES: { [G in CredentialGroup]: Record<string, keyof CredentialsEnv> } = {
	linkedin: { email: 'LINKEDIN_EMAIL', password: 'LINKEDIN_PASSWORD', liAt: 'LINKEDIN_LI_AT' },
	discord: { token: 'DISCORD_TOKEN', channelId: 'DISCORD_CHANNEL_ID' },
	github: { username: 'GITHUB_USERNAME', token: 'GITHUB_TOKEN' },
	smtp: { host: 'SMTP_HOST', port: 'SMTP_PORT', user: 'SMTP_USER', password: 'SMTP_PASS', from: 'MAIL_FROM' },
}

/**
 * Agrupa as credenciais do `.env`. Um grupo só existe se alguma variável dele estiver preenchida, e aí precisa estar
 * completo (ex.: `LINKEDIN_EMAIL` sem `LINKEDIN_PASSWORD` é recusado).
 * @throws {Error} Com a variável e o problema de cada campo inválido, sem o valor (pode ser um segredo).
 */
export function credentialsFromEnv(env: CredentialsEnv): Credentials {
	const groups = Object.fromEntries(
		Object.entries(ENV_NAMES).flatMap(([group, names]) => {
			const values = Object.fromEntries(Object.entries(names).map(([field, name]) => [field, env[name]]))
			return Object.values(values).some(Boolean) ? [[group, values]] : []
		}),
	)

	const result = CredentialsSchema.safeParse(groups)
	if (result.success) return result.data

	const issues = result.error.issues.map(issue => {
		const [group, field] = issue.path as [CredentialGroup, string]
		return `${ENV_NAMES[group]?.[field] ?? issue.path.join('.')}: ${issue.message}`
	})
	throw new Error(`Credenciais inválidas no .env (${issues.join('; ')})`)
}
