import { GMAIL_APP_PASSWORDS_URL } from '@shared/contracts'
import type { Messages } from '@shared/i18n'

import type { CredentialGroup } from '../../api-types'
import type { TutorialPath, TutorialStep } from '../components/ui/Tutorial'

/** O passo a passo de uma conta: o que ela pede fora do site e onde buscar cada dado. */
export type AccountTutorial = { title: string; intro: string; paths: TutorialPath[] }

const DISCORD_PERMISSIONS = 'View Channels, Send Messages, Embed Links, Attach Files, Read Message History'

/** Os tutoriais de cada conta, no idioma escolhido, usados no onboarding e em Configurações › Contas. */
export function accountTutorials(t: Messages): Record<CredentialGroup, AccountTutorial> {
	const { linkedin, discord, github, smtp } = t.tutorials

	const discordSetup: TutorialStep[] = [
		{
			id: 'application',
			...discord.application,
			link: { href: 'https://discord.com/developers/applications', label: discord.application.link },
		},
		{ id: 'token', ...discord.token },
	]
	const discordChannelId: TutorialStep = { id: 'channel-id', ...discord.channelId }
	/** O convite do bot, com as permissões que a publicação usa (num fórum, a vaga vira um post, que é um tópico). */
	const discordInvite = (permissions: string): TutorialStep => ({
		id: 'invite',
		title: discord.invite.title,
		text: discord.invite.text,
		values: [
			{ label: discord.invite.scope, value: 'bot' },
			{ label: discord.invite.permissions, value: permissions },
		],
	})

	return {
		linkedin: {
			title: linkedin.title,
			intro: linkedin.intro,
			paths: [
				{
					id: 'linkedin',
					label: 'LinkedIn',
					steps: [
						{
							id: 'login',
							...linkedin.login,
							link: { href: 'https://www.linkedin.com/mypreferences/d/change-password', label: linkedin.login.link },
						},
						{ id: 'verification', ...linkedin.verification },
						{ id: 'li-at', ...linkedin.liAt, link: { href: 'https://www.linkedin.com/feed/', label: linkedin.liAt.link } },
						{ id: 'li-at-when', ...linkedin.liAtWhen },
					],
				},
			],
		},
		discord: {
			title: discord.title,
			intro: discord.intro,
			paths: [
				{
					id: 'text',
					label: discord.textChannel,
					steps: [
						...discordSetup,
						discordInvite(DISCORD_PERMISSIONS),
						{ id: 'channel', ...discord.textChannelStep },
						discordChannelId,
					],
				},
				{
					id: 'forum',
					label: discord.forumChannel,
					steps: [
						...discordSetup,
						discordInvite(`${DISCORD_PERMISSIONS}, Send Messages in Threads`),
						{
							id: 'channel',
							title: discord.forum.title,
							text: discord.forum.text,
							values: [
								{ label: discord.forum.workMode, value: discord.forum.workModeValues },
								{ label: discord.forum.contract, value: discord.forum.contractValues },
								{ label: discord.forum.technologies, value: discord.forum.technologiesValues },
							],
						},
						discordChannelId,
					],
				},
			],
		},
		github: {
			title: github.title,
			intro: github.intro,
			paths: [
				{
					id: 'github',
					label: 'GitHub',
					steps: [
						{
							id: 'username',
							...github.username,
							link: { href: 'https://github.com/settings/profile', label: github.username.link },
						},
						{
							id: 'token',
							title: github.token.title,
							text: github.token.text,
							link: { href: 'https://github.com/settings/personal-access-tokens/new', label: github.token.link },
							values: [
								{ label: 'Repository access', value: 'Public repositories' },
								{ label: 'Permissions', value: github.token.permissions },
								{ label: 'Expiration', value: github.token.expiration },
							],
						},
					],
				},
			],
		},
		smtp: {
			title: smtp.title,
			intro: smtp.intro,
			paths: [
				{
					id: 'gmail',
					label: 'Gmail',
					steps: [
						{
							id: 'two-step',
							...smtp.gmail.twoStep,
							link: {
								href: 'https://myaccount.google.com/signinoptions/two-step-verification',
								label: smtp.gmail.twoStep.link,
							},
						},
						{
							id: 'app-password',
							...smtp.gmail.appPassword,
							link: { href: GMAIL_APP_PASSWORDS_URL, label: smtp.gmail.appPassword.link },
						},
						{
							id: 'fields',
							title: smtp.fields,
							text: smtp.gmail.fields,
							values: [
								{ label: smtp.user, value: smtp.gmail.userValue },
								{ label: smtp.appPassword, value: smtp.gmail.passwordValue },
								{ label: smtp.server, value: 'smtp.gmail.com' },
								{ label: smtp.port, value: '587' },
							],
						},
						{ id: 'refused', title: smtp.refused, text: smtp.gmail.refused },
					],
				},
				{
					id: 'outlook',
					label: 'Outlook',
					notice: smtp.outlook.notice,
					steps: [
						{
							id: 'smtp-auth',
							...smtp.outlook.smtpAuth,
							link: { href: 'https://admin.microsoft.com', label: smtp.outlook.smtpAuth.link },
						},
						{
							id: 'app-password',
							...smtp.outlook.appPassword,
							link: { href: 'https://mysignins.microsoft.com/security-info', label: smtp.outlook.appPassword.link },
						},
						{
							id: 'fields',
							title: smtp.fields,
							text: smtp.outlook.fields,
							values: [
								{ label: smtp.user, value: smtp.outlook.userValue },
								{ label: smtp.appPassword, value: smtp.outlook.passwordValue },
								{ label: smtp.server, value: 'smtp.office365.com' },
								{ label: smtp.port, value: '587' },
							],
						},
						{ id: 'refused', title: smtp.refused, text: smtp.outlook.refused },
					],
				},
				{
					id: 'other',
					label: smtp.other.label,
					steps: [
						{ id: 'app-password', ...smtp.other.appPassword },
						{
							id: 'fields',
							title: smtp.fields,
							text: smtp.other.fields,
							values: [
								{ label: smtp.user, value: smtp.other.userValue },
								{ label: smtp.appPassword, value: smtp.other.passwordValue },
								{ label: smtp.port, value: smtp.other.portValue },
							],
						},
						{ id: 'refused', title: smtp.refused, text: smtp.other.refused },
					],
				},
			],
		},
	}
}
