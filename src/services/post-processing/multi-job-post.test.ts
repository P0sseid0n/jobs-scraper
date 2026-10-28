import { describe, expect, test } from 'bun:test'

import { listingKeywordText, roleLinePostId, splitMultiJobPost, splitRoleListPost } from './multi-job-post'

// Post real de agregador (resumido)
const AGGREGATOR_POST = `🚨 10 VAGAS EM TODO BRASIL:

📄 Technical operations manager remote sensing monitoring rs m latin america
🔗 Candidate-se: https://lnkd.in/e5c5H3-v

📄 Junior pleno front end engineer remote
🔗 Candidate-se: https://lnkd.in/eQUCFcXh

📄 Hubspot administrator remote
🔗 Candidate-se: https://lnkd.in/eCgCzEZy

📄 Technical project manager data center remote
🔗 Candidate-se: https://lnkd.in/ecGCDe7s

📄 Technical project manager data center remote
🔗 Candidate-se: https://lnkd.in/eWUZnNCq`

describe('splitMultiJobPost', () => {
	test('separa cada vaga do post de agregador com o cargo e o link, sem o cabeçalho da lista', () => {
		const listings = splitMultiJobPost(AGGREGATOR_POST)

		expect(listings?.some(listing => listing.text.includes('10 VAGAS'))).toBe(false)
		expect(listings?.[1]).toEqual({
			title: 'Junior pleno front end engineer remote',
			link: 'https://lnkd.in/eQUCFcXh',
			text: '📄 Junior pleno front end engineer remote\n🔗 Candidate-se: https://lnkd.in/eQUCFcXh',
		})
	})

	test('o mesmo cargo repetido com outro link vira uma vaga só', () => {
		const titles = splitMultiJobPost(AGGREGATOR_POST)?.map(listing => listing.title)

		expect(titles).toEqual([
			'Technical operations manager remote sensing monitoring rs m latin america',
			'Junior pleno front end engineer remote',
			'Hubspot administrator remote',
			'Technical project manager data center remote',
		])
	})

	test('aceita uma vaga por linha, com o link no fim e numeração', () => {
		const post = `Vagas da semana
1. Desenvolvedor Vue Pleno - https://lnkd.in/a1
2) Analista de Dados: https://lnkd.in/b2.
3. QA Sênior | https://lnkd.in/c3`

		expect(splitMultiJobPost(post)).toEqual([
			{ title: 'Desenvolvedor Vue Pleno', link: 'https://lnkd.in/a1', text: '1. Desenvolvedor Vue Pleno - https://lnkd.in/a1' },
			{ title: 'Analista de Dados', link: 'https://lnkd.in/b2', text: '2) Analista de Dados: https://lnkd.in/b2.' },
			{ title: 'QA Sênior', link: 'https://lnkd.in/c3', text: '3. QA Sênior | https://lnkd.in/c3' },
		])
	})

	test('blocos sem linha em branco entre eles: o cabeçalho não entra na primeira vaga', () => {
		const post = `Vagas em São Paulo
Dev Front-end
Candidate-se: https://lnkd.in/a1
Dev Back-end
Candidate-se: https://lnkd.in/b2
Dev Mobile
Candidate-se: https://lnkd.in/c3`

		const listings = splitMultiJobPost(post)

		expect(listings?.map(listing => listing.title)).toEqual(['Dev Front-end', 'Dev Back-end', 'Dev Mobile'])
		expect(listings?.[0]?.text).toBe('Dev Front-end\nCandidate-se: https://lnkd.in/a1')
	})

	test('rótulo sozinho antes do link e linhas "em branco" com espaço braille: o cargo é o item numerado do bloco', () => {
		const post = [
			'Separei vagas remotas pagando em dólar 💵',
			'⠀',
			'3 VAGAS INTERNACIONAIS.',
			'⠀',
			'1️⃣ CONTENT REVIEW ANALYST',
			'💰 US$ 12 a 15/hora',
			'⠀',
			'Área: revisão de anúncios.',
			'⠀',
			'Candidatura:',
			'https://lnkd.in/aaa111',
			'⠀',
			'2️⃣ NORTHWIND',
			'Senior Frontend Engineer',
			'⠀',
			'Área: React e TypeScript.',
			'⠀',
			'Candidatura:',
			'https://lnkd.in/bbb222',
			'⠀',
			'3️⃣ PRODUCT DESIGNER',
			'⠀',
			'Candidatura:',
			'https://lnkd.in/ccc333',
		].join('\n')

		const listings = splitMultiJobPost(post)

		expect(listings?.map(listing => listing.title)).toEqual(['CONTENT REVIEW ANALYST', 'NORTHWIND', 'PRODUCT DESIGNER'])
		expect(listings?.[1]?.text).toBe(
			'2️⃣ NORTHWIND\nSenior Frontend Engineer\n\nÁrea: React e TypeScript.\n\nCandidatura:\nhttps://lnkd.in/bbb222',
		)
		expect(listingKeywordText(listings![1]!)).not.toContain('lnkd.in')
	})

	test('rótulo sozinho antes do link, sem numeração: o cargo é a primeira linha do parágrafo', () => {
		const post = `Dev Front-end
Remoto
Candidatura:
https://lnkd.in/a1

Dev Back-end
Candidatura:
https://lnkd.in/b2

Dev Mobile
Candidatura:
https://lnkd.in/c3`

		expect(splitMultiJobPost(post)?.map(listing => listing.title)).toEqual(['Dev Front-end', 'Dev Back-end', 'Dev Mobile'])
	})

	test('post de uma vaga só, mesmo com alguns links, não é dividido', () => {
		const post = `Estamos contratando Desenvolvedor(a) Front-end Vue!

Requisitos: Vue 3, TypeScript e testes.
Candidate-se: https://empresa.com/vagas/123
Conheça a empresa: https://empresa.com`

		expect(splitMultiJobPost(post)).toBeNull()
	})

	test('post de projeto com links no formato de lista, sem falar de vagas, não é dividido', () => {
		const post = `Placar Live V2 — pronto para a final do campeonato
Evoluí o projeto com gráficos, atualizações por WebSocket e cache com ETag.

Tecnologias: Node.js • TypeScript • Next.js • React • PostgreSQL

🌐 Aplicação:
https://lnkd.in/app111

📦 Backend:
https://lnkd.in/back222

📦 Frontend:
https://lnkd.in/front333

Feedbacks são bem-vindos! #NodeJS #React`

		expect(splitMultiJobPost(post)).toBeNull()
	})

	test('post de comunidade com o convite de cada grupo, mesmo falando de vagas, não é dividido', () => {
		// Post real reescrito: as linhas antes dos links são frases, não cargos
		const post = `Procurando um grupo da sua área? Temos comunidades para várias tecnologias.

No nosso Discord divulgamos vagas todos os dias!
https://lnkd.in/disc111

JavaScript é sua praia? Entre no grupo para trocar dicas e tirar dúvidas.
https://lnkd.in/js222

Desenvolvimento de jogos: converse sobre engines, mecânicas e projetos de games.
https://lnkd.in/games333

Curte Kotlin? Venha trocar conhecimentos com outros devs.
https://lnkd.in/kotlin444

Também temos grupos de vagas toda semana:

Vagas T.I. - Remotas
https://lnkd.in/vagas555`

		expect(splitMultiJobPost(post)).toBeNull()
	})

	test('vários links na mesma linha não são divididos', () => {
		const post = `Links: https://a.com https://b.com
Outros: https://c.com https://d.com
Mais: https://e.com https://f.com`

		expect(splitMultiJobPost(post)).toBeNull()
	})
})

// Post real de uma empresa (resumido): várias vagas e um link só para todas
const ROLE_LIST_POST = `Toda grande jornada começa com uma oportunidade. Que tal começar a sua com a Cadmus?

Vagas em destaque da semana:

Desenvolvedor(a) Front-end React Sênior – Remoto.

Analista Funcional de Dynamics 365 CRM -Sênior - Híbrido | São Bernardo do Campo.

Mais vagas:

💼 Engenheiro(a) de Software Full Stack Sênior - Híbrido | Rio de Janeiro.
💼 Analista Funcional de Dynamics 365 CRM – Pleno - Híbrido | São Bernardo do Campo.

🔗 Link para inscrição:
https://lnkd.in/dMuf4Zq

#vagasti #vagasremotas #vagashibridas`

describe('splitRoleListPost', () => {
	test('divide a lista de vagas sem link próprio, cada uma com o post sem as linhas das outras', () => {
		const roles = splitRoleListPost(ROLE_LIST_POST)

		expect(roles?.map(role => role.title)).toEqual([
			'Desenvolvedor(a) Front-end React Sênior – Remoto',
			'Analista Funcional de Dynamics 365 CRM -Sênior - Híbrido | São Bernardo do Campo',
			'Engenheiro(a) de Software Full Stack Sênior - Híbrido | Rio de Janeiro',
			'Analista Funcional de Dynamics 365 CRM – Pleno - Híbrido | São Bernardo do Campo',
		])
		expect(roles?.[0]?.text).toBe(`Toda grande jornada começa com uma oportunidade. Que tal começar a sua com a Cadmus?

Vagas em destaque da semana:

Desenvolvedor(a) Front-end React Sênior – Remoto.

Mais vagas:

🔗 Link para inscrição:
https://lnkd.in/dMuf4Zq

#vagasti #vagasremotas #vagashibridas`)
	})

	test('ids estáveis e diferentes para cada vaga do mesmo post', () => {
		const [first, second] = splitRoleListPost(ROLE_LIST_POST) ?? []

		expect(roleLinePostId('urn:li:activity:1', first?.title ?? '')).toBe(roleLinePostId('urn:li:activity:1', first?.title ?? ''))
		expect(roleLinePostId('urn:li:activity:1', first?.title ?? '')).not.toBe(roleLinePostId('urn:li:activity:1', second?.title ?? ''))
	})

	test('não divide a vaga com a modalidade e o local em linhas próprias, nem o mesmo cargo repetido', () => {
		const post = `Vaga: Desenvolvedor Front-End Pleno - Nuvia Sistemas - Home Office

Desenvolvedor Front-End Pleno – Nuvia Sistemas – Home Office
Rio de Janeiro (Remote)
Requisitos: Vue.js – avançado, TypeScript – intermediário`

		expect(splitRoleListPost(post)).toBeNull()
	})

	test('divide os itens marcados abaixo de um cabeçalho de vagas, com a introdução valendo para todas', () => {
		const post = `O Instituto está com oportunidades abertas para atuação presencial em São Paulo-SP.

💻 Confira as oportunidades
🔹 Pessoa Desenvolvedora de Software — Front-end Sênior (React/Typescript)
🔹 Pessoa Desenvolvedora de Software — Back-end Sênior (Python)
🔹 Pessoa Analista de Dados Sênior

👉 Candidate-se pelo link:
🔗 https://lnkd.in/dW7zCnvV`
		const roles = splitRoleListPost(post)

		expect(roles?.map(role => role.title)).toEqual([
			'Pessoa Desenvolvedora de Software — Front-end Sênior (React/Typescript)',
			'Pessoa Desenvolvedora de Software — Back-end Sênior (Python)',
			'Pessoa Analista de Dados Sênior',
		])
		expect(roles?.[1]?.text).toBe(`O Instituto está com oportunidades abertas para atuação presencial em São Paulo-SP.

💻 Confira as oportunidades
🔹 Pessoa Desenvolvedora de Software — Back-end Sênior (Python)

👉 Candidate-se pelo link:
🔗 https://lnkd.in/dW7zCnvV`)
	})

	test('não divide os itens abaixo de uma vaga só, dos requisitos ou de um link', () => {
		const items = '🔹 React\n🔹 TypeScript\n🔹 Jest'

		expect(splitRoleListPost(`🚀 Vaga: Desenvolvedor Front-end Pleno\n${items}`)).toBeNull()
		expect(splitRoleListPost(`Estamos contratando!\nRequisitos para as vagas:\n${items}`)).toBeNull()
		expect(splitRoleListPost(`Vaga aberta!\nCadastre-se: https://vagas.exemplo.com/1\n${items}`)).toBeNull()
	})

	test('não divide lista de requisitos nem post que não fala de vagas', () => {
		expect(splitRoleListPost('Estamos contratando!\nReact – avançado\nNode – intermediário\nSQL – básico')).toBeNull()
		expect(
			splitRoleListPost('Minha rotina:\nSegunda - Remoto\nTerça - Presencial\nQuarta - Remoto\nQuinta - Híbrido'),
		).toBeNull()
	})
})
