import { describe, expect, test } from 'bun:test'
import type { Ollama } from 'ollama'

import { caseToRawPost } from './extraction-eval'
import { AiJobOutputSchema } from './extraction-output'
import { readCaseImages, readFixtures } from './feedback-fixtures'
import { classifiesByText, withoutTrailingHashtags } from './extraction-prompt'
import { buildProcessedJob, extractJobFromPost } from './job-extraction'

// Post de verdade no formato "detalhes na imagem": o texto não tem nenhum dado da vaga, a arte tem todos
const item = (await readFixtures()).find(fixture => fixture.postId === 'caso-imagem-front-end')!
const images = await readCaseImages(item)
// Quem procura emprego, com o currículo anexado
const seekerCase = (await readFixtures()).find(fixture => fixture.postId === 'caso-imagem-curriculo')!
const seeker = caseToRawPost(seekerCase, await readCaseImages(seekerCase))

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

describe('post com imagens: o texto decide se é vaga', () => {
	/** Um Ollama que responde `postTypes` em ordem e guarda quantas imagens foram em cada chamada. */
	function fakeOllama(...postTypes: string[]) {
		const calls: number[] = []
		const ollama = {
			chat: async (request: { messages: { images?: string[] }[] }) => {
				calls.push(request.messages.at(-1)?.images?.length ?? 0)
				return { message: { content: JSON.stringify({ ...answer, postType: postTypes[calls.length - 1] }) } }
			},
		}
		return { ollama: ollama as unknown as Ollama, calls }
	}

	test('texto que não é vaga: a imagem nem vai ao modelo', async () => {
		const { ollama, calls } = fakeOllama('job_seeker', 'job_opening')

		expect(await extractJobFromPost(ollama, 'gemma3:4b', seeker, null)).toMatchObject({ postType: 'job_seeker', isJob: false })
		expect(calls).toEqual([0])
	})

	test('texto que é vaga: a chamada com as imagens completa os dados e tem a palavra final', async () => {
		const { ollama, calls } = fakeOllama('job_opening', 'job_opening')

		expect(await extractJobFromPost(ollama, 'gemma3:4b', caseToRawPost(item, images), null)).toMatchObject({ imageText: answer.imageText })
		expect(calls).toEqual([0, 1])
	})

	test('texto curto demais: só a chamada com as imagens', async () => {
		const { ollama, calls } = fakeOllama('job_opening')
		const post = { ...caseToRawPost(item, images), text: 'Front-End Developer 👇 #vagas #frontend https://exemplo.com/vaga' }

		expect(await extractJobFromPost(ollama, 'gemma3:4b', post, null)).toMatchObject({ isJob: true })
		expect(calls).toEqual([1])
	})

	test('sem imagens: uma chamada só, como antes', async () => {
		const { ollama, calls } = fakeOllama('job_seeker')

		await extractJobFromPost(ollama, 'gemma3:4b', caseToRawPost(item), null)
		expect(calls).toEqual([0])
	})
})

test('as palavras que contam para o texto classificar o post: sem hashtags, links e menções', () => {
	expect(classifiesByText('🚀 Vaga aberta! Todos os detalhes estão na imagem 👇')).toBe(true)
	expect(classifiesByText('Front-End Developer #vagas #frontend #remoto #clt #pj #react #vue @Empresa https://exemplo.com')).toBe(false)
	expect(classifiesByText('Vaga de dev, detalhes na imagem')).toBe(false)
})

describe('bloco de hashtags no fim do post', () => {
	test('sai do texto, com as linhas em branco antes dele', () => {
		expect(withoutTrailingHashtags('Você faria uma entrevista em inglês hoje?\n\n#job #jobalert #developer\n#frontend, #webdev\n')).toBe(
			'Você faria uma entrevista em inglês hoje?',
		)
	})

	test('hashtag no meio do texto ou numa linha com outras palavras fica', () => {
		const text = 'Vaga #remoto para dev\nStack: #React #Node e TypeScript'
		expect(withoutTrailingHashtags(text)).toBe(text)
	})

	test('post só de hashtags fica como está', () => {
		expect(withoutTrailingHashtags('#vagas #frontend')).toBe('#vagas #frontend')
	})

	test('o bloco não vai ao modelo, mas continua no texto das regras da vaga', async () => {
		const requests: { messages: { content: string }[] }[] = []
		const ollama = {
			chat: async (request: (typeof requests)[number]) => {
				requests.push(request)
				return { message: { content: JSON.stringify(answer) } }
			},
		} as unknown as Ollama
		const post = caseToRawPost(item)

		await extractJobFromPost(ollama, 'gemma3:4b', post, null)
		expect(requests[0]?.messages.at(-1)?.content).not.toContain('#vuejs')
		// O Vue.js continua valendo pela hashtag (ver "sem a imagem, o que não está no texto é descartado como antes")
		expect(buildProcessedJob(post, answer, 'pt').necessaryKnowledge).toEqual(['Vue.js'])
	})
})
