import { GMAIL_APP_PASSWORDS_URL, isMicrosoftPersonalAccount } from '@shared/contracts'

import type { CredentialGroup } from '../../api-types'
import type { TutorialPath, TutorialStep } from '../components/ui/Tutorial'

/** O passo a passo de uma conta: o que ela pede fora do site e onde buscar cada dado. */
export type AccountTutorial = { title: string; intro: string; paths: TutorialPath[] }

const DISCORD_SETUP: TutorialStep[] = [
	{
		id: 'application',
		title: 'Crie a aplicação e o bot',
		text: 'No portal de desenvolvedores, clique em New Application, dê um nome (ex.: Vagas) e abra a aba Bot.',
		link: { href: 'https://discord.com/developers/applications', label: 'abrir o portal de desenvolvedores' },
	},
	{
		id: 'token',
		title: 'Copie o token do bot',
		text: 'Na aba Bot, clique em Reset Token e cole o valor em “token do bot”. Ele só aparece uma vez: se perder ou se o Discord recusar, gere outro. O token é a senha do bot: não compartilhe.',
	},
]

const DISCORD_CHANNEL_ID: TutorialStep = {
	id: 'channel-id',
	title: 'Copie o ID do canal',
	text: 'Ligue o modo desenvolvedor em Configurações do usuário › Avançado › Modo desenvolvedor. Depois, clique com o botão direito no canal › Copiar ID do canal e cole em “ID do canal”.',
}

/** O convite do bot, com as permissões que a publicação usa (num fórum, a vaga vira um post, que é um tópico). */
function discordInvite(permissions: string): TutorialStep {
	return {
		id: 'invite',
		title: 'Convide o bot para o seu servidor',
		text: 'Na aba OAuth2 › URL Generator, marque o escopo bot e as permissões abaixo, abra o link gerado e escolha o servidor. Se o canal for privado, adicione o bot nele em Editar canal › Permissões.',
		values: [
			{ label: 'escopo', value: 'bot' },
			{ label: 'permissões', value: permissions },
		],
	}
}

const DISCORD_PERMISSIONS = 'View Channels, Send Messages, Embed Links, Attach Files, Read Message History'

/** Os tutoriais de cada conta, usados no onboarding e em Configurações › Contas. */
export const ACCOUNT_TUTORIALS: Record<CredentialGroup, AccountTutorial> = {
	linkedin: {
		title: 'Como conectar o LinkedIn',
		intro: 'O scraper entra com a sua conta para ler os posts com vagas. O cookie li_at é opcional.',
		paths: [
			{
				id: 'linkedin',
				label: 'LinkedIn',
				steps: [
					{
						id: 'login',
						title: 'Use o e-mail e a senha do LinkedIn',
						text: 'Os mesmos com que você entra no site. Se você entra só pelo Google ou pela Apple, crie uma senha para a conta antes.',
						link: { href: 'https://www.linkedin.com/mypreferences/d/change-password', label: 'criar ou trocar a senha' },
					},
					{
						id: 'verification',
						title: 'Confirme o acesso, se o LinkedIn pedir',
						text: 'Ao salvar, a gente testa o login. Se vier um código, um QR code ou um aviso no app do celular, a confirmação abre numa janela aqui no site.',
					},
					{
						id: 'li-at',
						title: 'Opcional: copie o cookie li_at',
						text: 'No computador, com o LinkedIn aberto e logado, aperte F12 e vá em Application › Cookies › https://www.linkedin.com (no Firefox, Armazenamento › Cookies). Copie o valor da linha li_at e cole em “cookie li_at”.',
						link: { href: 'https://www.linkedin.com/feed/', label: 'abrir o LinkedIn' },
					},
					{
						id: 'li-at-when',
						title: 'Quando o cookie ajuda',
						text: 'Ele é usado enquanto o scraper não tem uma sessão salva: entra sem a senha e sem a verificação. Sair da conta naquele navegador invalida o cookie; aí, copie de novo.',
					},
				],
			},
		],
	},
	discord: {
		title: 'Como criar o bot do Discord',
		intro: 'O bot publica cada vaga nova num canal seu: num canal de texto, como mensagem; num fórum, como post com tags.',
		paths: [
			{
				id: 'text',
				label: 'canal de texto',
				steps: [
					...DISCORD_SETUP,
					discordInvite(DISCORD_PERMISSIONS),
					{
						id: 'channel',
						title: 'Crie o canal de texto',
						text: 'No servidor, crie um canal de texto só para as vagas (ex.: #vagas).',
					},
					DISCORD_CHANNEL_ID,
				],
			},
			{
				id: 'forum',
				label: 'canal de fórum',
				steps: [
					...DISCORD_SETUP,
					discordInvite(`${DISCORD_PERMISSIONS}, Send Messages in Threads`),
					{
						id: 'channel',
						title: 'Crie o fórum e as tags',
						text: 'Crie um canal do tipo Fórum (ex.: #vagas); ele só aparece com a Comunidade ligada em Configurações do servidor. Em Editar canal › Tags, crie as tags que quer ver nas vagas, com o nome igual ao da vaga: o bot põe até 5 por post.',
						values: [
							{ label: 'modalidade', value: 'Remoto, Híbrido, Presencial' },
							{ label: 'regime', value: 'CLT, PJ, Estágio, Freelance' },
							{ label: 'tecnologias', value: 'React, Python, SQL…' },
						],
					},
					DISCORD_CHANNEL_ID,
				],
			},
		],
	},
	github: {
		title: 'Como ligar o GitHub',
		intro: 'A gente lê os seus repositórios públicos para escolher os projetos mais próximos de cada vaga.',
		paths: [
			{
				id: 'github',
				label: 'GitHub',
				steps: [
					{
						id: 'username',
						title: 'Informe o seu usuário',
						text: 'É o nome no endereço do seu perfil (github.com/usuario). Entram só os repositórios públicos que são seus.',
						link: { href: 'https://github.com/settings/profile', label: 'ver o seu perfil' },
					},
					{
						id: 'token',
						title: 'Opcional: crie um token',
						text: 'Sem token, a API do GitHub permite só 60 consultas por hora. Crie um token fine-grained com os valores abaixo e cole em “token”. Quando ele vencer, o teste avisa que foi recusado: crie outro.',
						link: { href: 'https://github.com/settings/personal-access-tokens/new', label: 'criar o token' },
						values: [
							{ label: 'Repository access', value: 'Public repositories' },
							{ label: 'Permissions', value: 'nenhuma' },
							{ label: 'Expiration', value: 'a que preferir' },
						],
					},
				],
			},
		],
	},
	smtp: {
		title: 'Como configurar o e-mail',
		intro: 'O envio usa uma senha de app, não a senha normal da conta: os provedores recusam a senha normal no SMTP.',
		paths: [
			{
				id: 'gmail',
				label: 'Gmail',
				steps: [
					{
						id: 'two-step',
						title: 'Ligue a verificação em duas etapas',
						text: 'Sem ela, o Google não deixa criar a senha de app.',
						link: {
							href: 'https://myaccount.google.com/signinoptions/two-step-verification',
							label: 'abrir a verificação em duas etapas',
						},
					},
					{
						id: 'app-password',
						title: 'Crie uma senha de app',
						text: 'Dê um nome (ex.: jobs-scraper) e copie a senha de 16 letras que aparece: ela só é mostrada uma vez. Se a página disser que a opção não está disponível, a conta é de trabalho ou escola e o administrador bloqueou.',
						link: { href: GMAIL_APP_PASSWORDS_URL, label: 'abrir as senhas de app' },
					},
					{
						id: 'fields',
						title: 'Preencha a conta',
						text: 'O servidor e a porta saem do e-mail: não precisa abrir o “avançado”.',
						values: [
							{ label: 'usuário', value: 'voce@gmail.com' },
							{ label: 'senha de app', value: 'as 16 letras, sem espaços' },
							{ label: 'servidor', value: 'smtp.gmail.com' },
							{ label: 'porta', value: '587' },
						],
					},
					{
						id: 'refused',
						title: 'Se o teste disser que o login foi recusado',
						text: 'Confira se o usuário é o e-mail inteiro e se a senha é a de app, não a do Google. Trocar a senha do Google apaga as senhas de app: crie outra.',
					},
				],
			},
			{
				id: 'outlook',
				label: 'Outlook',
				notice:
					'Só contas de trabalho ou escola (Microsoft 365). A Microsoft não aceita senha, nem senha de app, no SMTP das contas pessoais (Outlook, Hotmail e Live): para essas, use o Gmail.',
				steps: [
					{
						id: 'smtp-auth',
						title: 'Peça ao administrador para liberar o SMTP AUTH',
						text: 'No Microsoft 365, o envio por SMTP vem desligado. O administrador liga no Centro de administração › Usuários › a sua conta › Email › Gerenciar aplicativos de email › SMTP autenticado.',
						link: { href: 'https://admin.microsoft.com', label: 'abrir o Centro de administração' },
					},
					{
						id: 'app-password',
						title: 'Crie uma senha de app, se a conta tiver verificação em duas etapas',
						text: 'Em Informações de segurança, adicione um método do tipo Senha de aplicativo e copie a senha. Sem a verificação em duas etapas, vale a senha da conta.',
						link: { href: 'https://mysignins.microsoft.com/security-info', label: 'abrir as informações de segurança' },
					},
					{
						id: 'fields',
						title: 'Preencha a conta',
						text: 'Com domínio próprio, o servidor não sai do e-mail: informe em “avançado”.',
						values: [
							{ label: 'usuário', value: 'voce@empresa.com.br' },
							{ label: 'senha de app', value: 'a criada no passo 2' },
							{ label: 'servidor', value: 'smtp.office365.com' },
							{ label: 'porta', value: '587' },
						],
					},
					{
						id: 'refused',
						title: 'Se o teste disser que o login foi recusado',
						text: 'Confira se o usuário é o e-mail inteiro e a senha. Com o código 5.7.139, o SMTP AUTH ainda está desligado para a sua caixa (ou a conta é pessoal).',
					},
				],
			},
		],
	},
}

/** O caminho do tutorial que combina com o que foi digitado na conta (o e-mail da Microsoft abre o do Outlook). */
export function tutorialPathFor(group: CredentialGroup, values: Record<string, string>) {
	if (group === 'smtp' && isMicrosoftPersonalAccount(values)) return 'outlook'
	return undefined
}
