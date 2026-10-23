import { once } from 'node:events'
import { Client, Events, GatewayIntentBits, type Interaction } from 'discord.js'

import type { CredentialsOf, CredentialSource } from '@shared/contracts'
import type { Logger } from '@shared/logging'
import { loadCredentials } from '@shared/settings'

import { resolveJobChannel, type JobChannel } from './job-publisher'

/** O bot logado e o canal das vagas. */
export type DiscordLink = { client: Client<true>; channel: JobChannel }

/** De quanto em quanto tempo as credenciais são relidas para ver se mudaram. */
const CHECK_INTERVAL_MS = 30_000

const NO_ACCOUNT =
	'Sem bot do Discord configurado: informe o token e o canal em Configurações › Contas (ou DISCORD_TOKEN e DISCORD_CHANNEL_ID no .env). Até lá, as vagas ficam só no site'

type ConnectionOptions = {
	logger: Logger
	onInteraction: (interaction: Interaction) => void
	/** Faz o login e busca o canal; `null` se o Discord recusou. Trocado nos testes, para não acessar o Discord. */
	connect?: (account: CredentialsOf<'discord'>, source: CredentialSource) => Promise<DiscordLink | null>
}

/**
 * A conexão com o Discord a partir das credenciais (site ou `.env`), relidas a cada 30 s: quando o token ou o canal
 * mudam, o bot reconecta sem reiniciar. Sem credenciais, fica em espera; com credenciais recusadas, espera outras.
 */
export class DiscordConnection {
	private link: DiscordLink | null = null
	/** As credenciais da última tentativa (`undefined` antes da primeira), para só reconectar quando mudam. */
	private accountKey: string | null | undefined
	private waiting: { resolve: (link: DiscordLink | null) => void; reject: (error: Error) => void }[] = []
	private checking: Promise<void> = Promise.resolve()
	private timer?: ReturnType<typeof setInterval>
	private closed = false

	constructor(private readonly options: ConnectionOptions) {}

	/** Conecta com as credenciais atuais (se houver) e passa a acompanhar as mudanças. */
	async start() {
		await this.check()
		this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS)
	}

	/**
	 * O bot conectado; `null` se não há bot configurado (sem token e canal no site nem no `.env`). Configurado mas sem
	 * conexão (conectando, trocando de conta ou com as credenciais recusadas), espera ela existir.
	 */
	ready(): Promise<DiscordLink | null> {
		if (this.link) return Promise.resolve(this.link)
		if (this.closed) return Promise.reject(new Error('Bot do Discord encerrado'))
		if (this.accountKey === null) return Promise.resolve(null)

		return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }))
	}

	async close() {
		this.closed = true
		clearInterval(this.timer)

		for (const waiter of this.waiting.splice(0)) waiter.reject(new Error('Bot do Discord encerrado'))
		await this.disconnect()
	}

	/** Relê as credenciais e reconecta se mudaram (já acontece sozinho a cada 30 s). */
	check() {
		this.checking = this.checking
			.then(() => this.refresh())
			.catch(error => this.options.logger.error({ err: error }, 'Não foi possível ler as credenciais do Discord'))

		return this.checking
	}

	private async refresh() {
		const credentials = await loadCredentials('discord')
		const key = credentials ? JSON.stringify(credentials.value) : null
		if (this.closed || key === this.accountKey) return

		const reconnecting = this.link !== null
		this.accountKey = key
		await this.disconnect()

		if (!credentials) {
			this.options.logger.warn(NO_ACCOUNT)
			for (const waiter of this.waiting.splice(0)) waiter.resolve(null)
			return
		}

		if (reconnecting) this.options.logger.info('Credenciais do Discord alteradas: reconectando')
		const connect = this.options.connect ?? ((account, source) => this.connect(account, source))
		const link = await connect(credentials.value, credentials.source)
		if (!link) return

		this.link = link
		for (const waiter of this.waiting.splice(0)) waiter.resolve(link)
	}

	private async connect(account: CredentialsOf<'discord'>, source: CredentialSource): Promise<DiscordLink | null> {
		const { logger } = this.options
		const client = new Client({ intents: [GatewayIntentBits.Guilds] })
		client.on(Events.InteractionCreate, this.options.onInteraction)

		try {
			const ready = once(client, Events.ClientReady)
			await client.login(account.token)
			await ready
		} catch (error) {
			logger.error(
				{ err: error },
				'Falha no login do Discord: confira o token do bot em Configurações › Contas (ou DISCORD_TOKEN no .env)',
			)
			await client.destroy()
			return null
		}

		const loggedIn = client as Client<true>
		logger.info({ user: loggedIn.user.tag, source }, 'Logado no Discord')

		const channel = await resolveJobChannel(loggedIn, account.channelId, logger)
		if (!channel) {
			await client.destroy()
			return null
		}

		return { client: loggedIn, channel }
	}

	private async disconnect() {
		const link = this.link
		this.link = null
		await link?.client.destroy()
	}
}
