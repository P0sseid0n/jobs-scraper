import { smtpHostOf, type CredentialsOf } from '@shared/contracts'
import { t } from '@shared/i18n'

import { classifyMailError, isLoginRefused } from '../../mailer/mail-errors'
import { createSmtpTransport, senderOf, type MailTransport } from '../../mailer/mail-transport'
import type { CredentialCheck } from '../api-types'

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

const TIMEOUT_MS = 10_000
const DISCORD_API = 'https://discord.com/api/v10'
const GITHUB_API = 'https://api.github.com'

/** Tipos de canal que aceitam as vagas: texto, anúncios e fórum. */
const JOB_CHANNEL_TYPES = new Set([0, 5, 15])

/**
 * Confere se o token do bot é aceito e se ele vê o canal (e se o canal aceita as vagas). As mensagens nunca trazem o
 * token, que só vai no cabeçalho da requisição.
 */
export async function checkDiscord(account: CredentialsOf<'discord'>, fetchFn: Fetch = fetch): Promise<CredentialCheck> {
	const get = (path: string) =>
		fetchFn(`${DISCORD_API}${path}`, { headers: { Authorization: `Bot ${account.token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) })

	return reachable('Discord', async () => {
		const me = await get('/users/@me')
		if (me.status === 401) return { ok: false, message: t().credentialChecks.discordTokenRefused, step: 'token' }
		if (!me.ok) return { ok: false, message: t().credentialChecks.discordStatus(me.status, t().credentialChecks.theToken) }
		const bot = (await me.json()) as { username: string }

		const response = await get(`/channels/${account.channelId}`)
		if ([403, 404].includes(response.status)) {
			return {
				ok: false,
				message: t().credentialChecks.channelNoAccess(bot.username),
				step: 'invite',
			}
		}
		if (!response.ok)
			return { ok: false, message: t().credentialChecks.discordStatus(response.status, t().credentialChecks.theChannel) }

		const channel = (await response.json()) as { name?: string; type: number }
		if (!JOB_CHANNEL_TYPES.has(channel.type)) {
			return { ok: false, message: t().credentialChecks.channelType(channel.name ?? account.channelId), step: 'channel' }
		}

		return { ok: true, message: t().credentialChecks.discordOk(bot.username, channel.name ?? account.channelId) }
	})
}

/** Confere se o usuário existe no GitHub e, com token, se o token é aceito. */
export async function checkGithub(account: CredentialsOf<'github'>, fetchFn: Fetch = fetch): Promise<CredentialCheck> {
	const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'jobs-scraper' }
	if (account.token) headers.Authorization = `Bearer ${account.token}`

	return reachable('GitHub', async () => {
		const response = await fetchFn(`${GITHUB_API}/users/${encodeURIComponent(account.username)}`, {
			headers,
			signal: AbortSignal.timeout(TIMEOUT_MS),
		})

		if (response.status === 401) return { ok: false, message: t().credentialChecks.githubTokenRefused, step: 'token' }
		if (response.status === 404) {
			return { ok: false, message: t().credentialChecks.githubNoUser(account.username), step: 'username' }
		}
		if (!response.ok) return { ok: false, message: t().credentialChecks.githubStatus(response.status) }

		const user = (await response.json()) as { login: string; public_repos: number }
		return { ok: true, message: t().credentialChecks.githubOk(user.login, user.public_repos, !!account.token) }
	})
}

/**
 * Confere se o servidor SMTP aceita a conexão e o login, sem enviar nenhum e-mail. A mensagem traz o motivo já
 * classificado (login recusado, servidor fora), nunca a senha nem a resposta crua do servidor.
 */
export async function checkSmtp(
	account: CredentialsOf<'smtp'>,
	/** O nome do currículo base, que entra no remetente quando a conta não tem um (`senderOf`). */
	senderName: string | null,
	createTransport: (account: CredentialsOf<'smtp'>) => Pick<MailTransport, 'verify'> = createSmtpTransport,
): Promise<CredentialCheck> {
	try {
		await createTransport(account).verify()
	} catch (error) {
		// O login recusado aponta para a senha de app, o motivo mais comum
		return { ok: false, message: classifyMailError(error).reason, ...(isLoginRefused(error) && { step: 'app-password' }) }
	}

	return { ok: true, message: t().credentialChecks.smtpOk(smtpHostOf(account), senderOf(account, senderName)) }
}

/** Falha de rede ou tempo esgotado vira uma resposta do teste, em vez de erro da API. */
async function reachable(service: string, check: () => Promise<CredentialCheck>): Promise<CredentialCheck> {
	try {
		return await check()
	} catch (error) {
		const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
		return { ok: false, message: timedOut ? t().credentialChecks.timedOut(service) : t().credentialChecks.unreachable(service) }
	}
}
