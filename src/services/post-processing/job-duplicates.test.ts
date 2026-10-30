import { describe, expect, test } from 'bun:test'

import { findDuplicate, similarTitles, specificApplyLink, textSimilarity, type DuplicateCandidate } from './job-duplicates'

// O padrão das configurações (`duplicateSimilarityPercent`)
const THRESHOLD = 0.6

// Pares de posts no formato dos que o scraper coleta (empresas e pessoas trocadas por nomes fictícios)
const FRONTEND_POST = `🚀 Estamos contratando!

A Acme Tecnologia está buscando uma pessoa Desenvolvedora Front-end Pleno para atuar no nosso time de produto.

Requisitos:
- Experiência com React e TypeScript
- Conhecimento em testes automatizados
- Vivência com design systems

Diferenciais:
- Next.js
- Experiência com acessibilidade

Modelo: 100% remoto | CLT
Interessados enviar currículo para vagas@acme.example

#vagas #frontend #react`

// O mesmo post repostado por outra pessoa dias depois: outra abertura, emojis, uma linha a mais e outras hashtags
const FRONTEND_REPOST = `Pessoal, olha essa oportunidade 👇

A Acme Tecnologia está buscando uma pessoa Desenvolvedora Front-end Pleno para atuar no nosso time de produto.

Requisitos:
✅ Experiência com React e TypeScript
✅ Conhecimento em testes automatizados
✅ Vivência com design systems

Diferenciais:
⭐ Next.js
⭐ Experiência com acessibilidade

Modelo: 100% remoto | CLT
Interessados enviar currículo para vagas@acme.example
Compartilhem com quem estiver procurando!

#oportunidade #hiring #typescript`

// Outra vaga da mesma empresa, no mesmo modelo de post
const BACKEND_POST = `🚀 Estamos contratando!

A Acme Tecnologia está buscando uma pessoa Desenvolvedora Back-end Pleno para atuar no nosso time de produto.

Requisitos:
- Experiência com Node.js e PostgreSQL
- Conhecimento em mensageria (RabbitMQ ou Kafka)
- Vivência com microsserviços

Modelo: 100% remoto | CLT
Interessados enviar currículo para vagas@acme.example

#vagas #backend #node`

// A mesma vaga de front-end, mas sênior
const FRONTEND_SENIOR_POST = FRONTEND_POST.replace('Front-end Pleno', 'Front-end Sênior')

// Outra empresa com uma vaga de mesmo cargo e um texto parecido
const OTHER_COMPANY_POST = FRONTEND_POST.replace('Acme Tecnologia', 'Beta Sistemas').replace('vagas@acme.example', 'rh@beta.example')

const original: DuplicateCandidate = {
	postId: 'urn:li:activity:1',
	title: 'Desenvolvedora Front-end Pleno',
	company: 'Acme Tecnologia',
	applyLink: null,
	rawContent: FRONTEND_POST,
}

describe('textSimilarity', () => {
	test('repostagem com emojis, hashtags e uma linha a mais fica acima do limiar', () => {
		expect(textSimilarity(FRONTEND_POST, FRONTEND_REPOST)).toBeGreaterThanOrEqual(THRESHOLD)
	})

	test('outra vaga no mesmo modelo de post fica abaixo do limiar', () => {
		expect(textSimilarity(FRONTEND_POST, BACKEND_POST)).toBeLessThan(THRESHOLD)
	})

	test('textos iguais valem 1 e textos vazios, 0', () => {
		expect(textSimilarity(FRONTEND_POST, FRONTEND_POST)).toBe(1)
		expect(textSimilarity('', '')).toBe(0)
	})
})

describe('similarTitles', () => {
	test('grafias diferentes do mesmo cargo', () => {
		expect(similarTitles('Desenvolvedora Front-end Pleno', 'Dev Frontend Pleno')).toBe(true)
		expect(similarTitles('Desenvolvedor Front-end', 'Desenvolvedor Front-end React (Pleno)')).toBe(true)
		expect(similarTitles('Analista de Dados Sr', 'Analista de Dados Sênior')).toBe(true)
	})

	test('"Full Stack" e "Fullstack" são a mesma palavra', () => {
		expect(similarTitles('Desenvolvedor Full Stack Pleno', 'Desenvolvedor(a) Fullstack Pleno')).toBe(true)
		expect(similarTitles('Dev Front End', 'Desenvolvedor Front-end')).toBe(true)
	})

	test('cargos ou níveis diferentes', () => {
		expect(similarTitles('Desenvolvedor Front-end Pleno', 'Desenvolvedor Back-end Pleno')).toBe(false)
		expect(similarTitles('Desenvolvedor Front-end Pleno', 'Desenvolvedor Front-end Sênior')).toBe(false)
		expect(similarTitles('Analista de Marketing', 'Analista de Dados')).toBe(false)
		expect(similarTitles(null, 'Analista de Dados')).toBe(false)
	})
})

describe('specificApplyLink', () => {
	test('tira www, rastreamento e barra final', () => {
		expect(specificApplyLink('https://www.acme.gupy.io/jobs/123456?utm_source=linkedin&jobBoardSource=x')).toBe(
			'acme.gupy.io/jobs/123456?jobBoardSource=x',
		)
		expect(specificApplyLink('https://forms.gle/AbC123/')).toBe('forms.gle/AbC123')
	})

	test('links genéricos não identificam a vaga', () => {
		expect(specificApplyLink('https://acme.gupy.io/')).toBeNull()
		expect(specificApplyLink('https://acme.example/carreiras')).toBeNull()
		expect(specificApplyLink('https://acme.example/trabalhe-conosco/')).toBeNull()
		expect(specificApplyLink('https://www.linkedin.com/company/acme/jobs/')).toBeNull()
		expect(specificApplyLink('https://www.linkedin.com/in/fulana')).toBeNull()
		expect(specificApplyLink('não é link')).toBeNull()
	})

	test('a vaga no LinkedIn é específica', () => {
		expect(specificApplyLink('https://www.linkedin.com/jobs/view/4012345678/')).toBe('linkedin.com/jobs/view/4012345678')
	})
})

describe('findDuplicate', () => {
	test('repostagem da mesma vaga com texto um pouco diferente é agrupada', () => {
		const repost = { ...original, postId: 'urn:li:activity:2', title: 'Dev Frontend Pleno', rawContent: FRONTEND_REPOST }

		expect(findDuplicate(repost, [original], THRESHOLD)).toMatchObject({ postId: original.postId, reason: 'text' })
	})

	test('vagas diferentes da mesma empresa ficam separadas', () => {
		const backend = { ...original, postId: 'urn:li:activity:3', title: 'Desenvolvedora Back-end Pleno', rawContent: BACKEND_POST }
		const senior = {
			...original,
			postId: 'urn:li:activity:4',
			title: 'Desenvolvedora Front-end Sênior',
			rawContent: FRONTEND_SENIOR_POST,
		}

		expect(findDuplicate(backend, [original], THRESHOLD)).toBeNull()
		expect(findDuplicate(senior, [original], THRESHOLD)).toBeNull()
	})

	test('mesma vaga em outra empresa fica separada', () => {
		const other = { ...original, postId: 'urn:li:activity:5', company: 'Beta Sistemas', rawContent: OTHER_COMPANY_POST }

		expect(findDuplicate(other, [original], THRESHOLD)).toBeNull()
	})

	test('sem empresa, o texto parecido não agrupa', () => {
		const repost = { ...original, postId: 'urn:li:activity:6', company: null, rawContent: FRONTEND_REPOST }

		expect(findDuplicate(repost, [{ ...original, company: null }], THRESHOLD)).toBeNull()
	})

	test('o mesmo link específico agrupa mesmo sem empresa e com texto diferente', () => {
		const link = 'https://acme.gupy.io/jobs/123456'
		const repost = {
			postId: 'urn:li:activity:7',
			title: 'Desenvolvedor Front-end Pleno',
			company: null,
			applyLink: `${link}?utm_source=linkedin`,
			rawContent: 'Vaga aberta pra front pleno, candidatura no link',
		}

		expect(findDuplicate(repost, [{ ...original, applyLink: link }], THRESHOLD)).toMatchObject({ reason: 'applyLink' })
		// Com o mesmo link, um cargo diferente continua separado
		expect(findDuplicate({ ...repost, title: 'Desenvolvedor Back-end' }, [{ ...original, applyLink: link }], THRESHOLD)).toBeNull()
	})

	test('o link genérico de carreiras não agrupa', () => {
		const link = 'https://acme.example/carreiras'
		const repost = { ...original, postId: 'urn:li:activity:8', company: null, applyLink: link, rawContent: 'Front pleno na Acme' }

		expect(findDuplicate(repost, [{ ...original, applyLink: link }], THRESHOLD)).toBeNull()
	})

	test('vagas do mesmo post com várias vagas não se agrupam', () => {
		const sibling = { ...original, postId: 'listing:a', sourcePostId: 'urn:li:activity:9' }

		expect(findDuplicate({ ...sibling, postId: 'listing:b' }, [sibling], THRESHOLD)).toBeNull()
	})

	test('mesma empresa e o mesmo cargo com nível agrupa mesmo com o texto todo diferente', () => {
		const rewritten = {
			...original,
			postId: 'urn:li:activity:12',
			title: 'Desenvolvedor(a) Frontend Pleno',
			company: 'ACME Tecnologia Ltda.',
			rawContent: 'Vem fazer parte do nosso time! Buscamos front pleno para o time de produto, inscrição no portal.',
		}

		expect(findDuplicate(rewritten, [original], THRESHOLD)).toMatchObject({ postId: original.postId, reason: 'title' })
	})

	test('sem nível no cargo, ou com cargo só parecido, o texto diferente não agrupa', () => {
		const rewritten = { ...original, postId: 'urn:li:activity:13', rawContent: 'Vem fazer parte do nosso time!' }

		expect(
			findDuplicate(
				{ ...rewritten, title: 'Desenvolvedora Front-end' },
				[{ ...original, title: 'Desenvolvedora Front-end' }],
				THRESHOLD,
			),
		).toBeNull()
		expect(findDuplicate({ ...rewritten, title: 'Desenvolvedora Front-end React Pleno' }, [original], THRESHOLD)).toBeNull()
		expect(findDuplicate({ ...rewritten, company: null }, [original], THRESHOLD)).toBeNull()
	})

	test('o texto parecido vale mais que só o mesmo cargo', () => {
		const repost = { ...original, postId: 'urn:li:activity:14', rawContent: FRONTEND_REPOST }
		const sameTitleOnly = { ...original, postId: 'urn:li:activity:15', rawContent: 'Vem fazer parte do nosso time!' }

		expect(findDuplicate(repost, [sameTitleOnly, original], THRESHOLD)).toMatchObject({ postId: original.postId, reason: 'text' })
	})

	test('escolhe a mais parecida entre as candidatas', () => {
		const repost = { ...original, postId: 'urn:li:activity:10', rawContent: FRONTEND_REPOST }
		const weaker = { ...original, postId: 'urn:li:activity:11', rawContent: `${FRONTEND_REPOST}\n\n${BACKEND_POST}` }

		expect(findDuplicate(repost, [weaker, original], 0.3)?.postId).toBe(original.postId)
	})
})
