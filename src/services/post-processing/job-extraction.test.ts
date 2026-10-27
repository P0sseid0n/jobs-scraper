import { describe, expect, test } from 'bun:test'

import { caseToRawPost } from './extraction-eval'
import { AiJobOutputSchema } from './extraction-output'
import { readCaseImages, readFixtures } from './feedback-fixtures'
import { buildProcessedJob } from './job-extraction'

// Post de verdade no formato "detalhes na imagem": o texto não tem nenhum dado da vaga, a arte tem todos
const item = (await readFixtures()).find(fixture => fixture.postId === 'caso-imagem-front-end')!
const images = await readCaseImages(item)

/** A resposta do modelo para o post: o texto transcrito da arte e os campos tirados dele. */
const answer = AiJobOutputSchema.parse({
	imageText:
		'ESTAMOS CONTRATANDO\nDesenvolvedor(a) Front-end Pleno\nAcme Tecnologia\n100% remoto PJ\nRequisitos\nVue.js 3 e Pinia\nTypeScript\nTestes com Vitest\nGit\nEnvie seu currículo para\ncontato1@exemplo.com',
	postType: 'job_opening',
	title: 'Desenvolvedor(a) Front-end Pleno',
	company: 'Acme Tecnologia',
	location: null,
	workMode: 'remoto',
	contractTypes: ['pj'],
	necessary_knowledge: ['Vue.js', 'Pinia', 'TypeScript', 'Vitest', 'Git'],
	recruiter_email: 'contato1@exemplo.com',
	link: null,
})

describe('vaga com os dados na imagem', () => {
	test('a fixture traz a imagem do post como o scraper a mandaria', () => {
		expect(images).toHaveLength(1)
		expect(images[0]?.mimeType).toBe('image/jpeg')
		expect(Buffer.from(images[0]!.data, 'base64').subarray(0, 2).toString('hex')).toBe('ffd8')
	})

	test('o texto lido na imagem conta nas regras do texto: cargo, requisitos e contato preenchidos, sem checks', () => {
		const job = buildProcessedJob(caseToRawPost(item, images), answer, 'pt')

		expect(job).toMatchObject({
			title: item.expected!.title,
			company: item.expected!.company,
			workMode: item.expected!.workMode,
			contractTypes: item.expected!.contractTypes,
			necessaryKnowledge: item.expected!.necessaryKnowledge,
			recruiterEmail: item.expected!.recruiterEmail,
			rawContent: item.post.text,
			imageCount: 1,
			imageText: answer.imageText,
		})
		expect(job.extractionChecks).toEqual([])
	})

	test('sem a imagem, o que não está no texto é descartado como antes', () => {
		const job = buildProcessedJob(caseToRawPost(item), answer, 'pt')

		// Só o Vue.js fica: está na hashtag do texto
		expect(job).toMatchObject({ company: null, workMode: null, contractTypes: null, necessaryKnowledge: ['Vue.js'] })
		expect(job).toMatchObject({ imageCount: 0, imageText: null })
		expect(job.extractionChecks).toEqual(expect.arrayContaining(['title', 'company', 'workMode', 'necessaryKnowledge']))
	})

	test('a transcrição não completa o que nem ela tem', () => {
		const job = buildProcessedJob(
			caseToRawPost(item, images),
			{ ...answer, necessary_knowledge: ['Vue.js', 'React'], workMode: 'hibrido' },
			'pt',
		)

		expect(job.necessaryKnowledge).toEqual(['Vue.js'])
		expect(job.workMode).toBeNull()
		expect(job.extractionChecks).toEqual(['workMode', 'necessaryKnowledge'])
	})
})
