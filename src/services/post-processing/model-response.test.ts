import { describe, expect, test } from 'bun:test'

import {
	keepContractTypesInPost,
	keepLinkIfInPost,
	keepSenioritiesInPost,
	keepSkillsInPost,
	locationWithoutWorkMode,
	parseModelResponse,
	rejectionReason,
} from './model-response'

describe('parseModelResponse', () => {
	test('retorna null quando o modelo responde "null"', () => {
		expect(parseModelResponse(' null ')).toBeNull()
	})

	test('normaliza campos com tipo errado ou ausentes', () => {
		const job = parseModelResponse(
			'{"title": "Dev Front End", "company": "", "necessary_knowledge": "Vue, TypeScript", "workMode": "Híbrido", "aiJobConfidence": "85"}',
		)

		expect(job).toEqual({
			title: 'Dev Front End',
			company: null,
			location: null,
			link: null,
			necessary_knowledge: ['Vue', 'TypeScript'],
			recruiter_email: null,
			contractTypes: null,
			seniorities: null,
			workMode: 'hibrido',
			postType: null,
			isJob: false,
			aiJobConfidence: 85,
		})
	})

	test('trata "null" e similares em texto como ausentes', () => {
		const job = parseModelResponse(
			'{"title": "null", "company": "N/A", "location": "None", "necessary_knowledge": ["null"], "workMode": "null", "aiJobConfidence": 20}',
		)

		expect(job).toMatchObject({ title: null, company: null, location: null, necessary_knowledge: null, workMode: null })
	})

	test('regimes: aceita grafias do modelo, remove repetidos e ordena', () => {
		expect(parseModelResponse('{"contractTypes": ["PJ", "CLT", "pj"]}')?.contractTypes).toEqual(['clt', 'pj'])
		expect(parseModelResponse('{"contractTypes": "Estágio"}')?.contractTypes).toEqual(['estagio'])
		expect(parseModelResponse('{"contractTypes": "CLT ou PJ"}')?.contractTypes).toEqual(['clt', 'pj'])
		expect(parseModelResponse('{"contractTypes": ["Freelancer", "temporário"]}')?.contractTypes).toEqual(['freelance'])
	})

	test('regimes: lista vazia, valor desconhecido ou ausente viram null', () => {
		expect(parseModelResponse('{"contractTypes": []}')?.contractTypes).toBeNull()
		expect(parseModelResponse('{"contractTypes": ["null"]}')?.contractTypes).toBeNull()
		expect(parseModelResponse('{"contractTypes": 3}')?.contractTypes).toBeNull()
		expect(parseModelResponse('{"title": "Vaga"}')?.contractTypes).toBeNull()
	})

	test('níveis: aceita siglas e intervalos do modelo', () => {
		expect(parseModelResponse('{"seniorities": ["Sênior", "Pleno"]}')?.seniorities).toEqual(['pleno', 'senior'])
		expect(parseModelResponse('{"seniorities": "Pleno/Sênior"}')?.seniorities).toEqual(['pleno', 'senior'])
		expect(parseModelResponse('{"seniorities": "Júnior a Pleno"}')?.seniorities).toEqual(['junior', 'pleno'])
		expect(parseModelResponse('{"seniorities": ["Sr.", "Tech Lead"]}')?.seniorities).toEqual(['senior', 'especialista'])
		expect(parseModelResponse('{"seniorities": ["trainee"]}')?.seniorities).toBeNull()
		expect(parseModelResponse('{"title": "Vaga"}')?.seniorities).toBeNull()
	})

	test('repara JSON levemente quebrado', () => {
		expect(parseModelResponse("{title: 'Vaga', aiJobConfidence: 90,}")?.title).toBe('Vaga')
	})

	test('lança erro quando a resposta não é um objeto', () => {
		expect(() => parseModelResponse('[1, 2]')).toThrow()
	})
})

describe('rejectionReason', () => {
	const job = parseModelResponse('{"title": "Dev Vue", "isJob": true, "aiJobConfidence": 80}')

	test('aceita vaga com confiança suficiente', () => {
		expect(rejectionReason(job, 60)).toBeNull()
	})

	test('rejeita quando não é vaga, confiança baixa ou resposta null', () => {
		expect(rejectionReason(parseModelResponse('{"isJob": false, "aiJobConfidence": 90}'), 60)).toContain('não é vaga')
		expect(rejectionReason(job, 90)).toContain('abaixo do mínimo')
		expect(rejectionReason(null, 60)).not.toBeNull()
	})

	test('postType decide se é vaga (formato atual)', () => {
		expect(parseModelResponse('{"postType": "job_opening", "aiJobConfidence": 90}')?.isJob).toBe(true)
		expect(parseModelResponse('{"postType": "job_seeker", "isJob": true, "aiJobConfidence": 90}')?.isJob).toBe(false)
		expect(rejectionReason(parseModelResponse('{"postType": "tips_or_list", "aiJobConfidence": 10}'), 60)).toContain('tips_or_list')
	})

	test('aceita isJob como texto', () => {
		expect(parseModelResponse('{"isJob": "true", "aiJobConfidence": 70}')?.isJob).toBe(true)
	})
})

describe('keepLinkIfInPost', () => {
	const text = 'Candidate-se em https://empresa.com/vagas/123 até sexta'

	test('mantém o link que está no texto', () => {
		expect(keepLinkIfInPost('https://empresa.com/vagas/123', text)).toBe('https://empresa.com/vagas/123')
	})

	test('descarta link inventado ou que não é URL', () => {
		expect(keepLinkIfInPost('https://empresa.com/careers', text)).toBeNull()
		expect(keepLinkIfInPost('empresa.com', text)).toBeNull()
		expect(keepLinkIfInPost(null, text)).toBeNull()
	})
})

describe('keepSkillsInPost', () => {
	const text = 'Vaga Full-Stack: 𝐂# / Python / Vue.js 3, NestJS e Node. Experiência com APIs REST e Microsoft Azure.'

	test('mantém os conhecimentos escritos no post, mesmo com outra grafia', () => {
		const skills = ['C#', 'Python', 'Vue.js', 'NestJS', 'Node.js', 'REST API', 'Azure']

		expect(keepSkillsInPost(skills, text)).toEqual(skills)
	})

	test('remove os que não estão no post', () => {
		expect(keepSkillsInPost(['Vue.js', 'React', 'SQL', 'Full Stack Development'], text)).toEqual(['Vue.js'])
	})

	test('não confunde letra solta com parte de palavra', () => {
		expect(keepSkillsInPost(['C', 'R'], 'Vaga para dev com experiência em React')).toBeNull()
	})

	test('null quando nada sobra ou não havia conhecimentos', () => {
		expect(keepSkillsInPost(['Java'], text)).toBeNull()
		expect(keepSkillsInPost(null, text)).toBeNull()
	})
})

describe('locationWithoutWorkMode', () => {
	test('descarta o local quando ele é só a modalidade', () => {
		for (const location of ['remoto', 'Remoto', '100% Remoto', 'Home Office', 'Híbrido', 'remote']) {
			expect(locationWithoutWorkMode(location)).toBeNull()
		}
	})

	test('mantém locais de verdade, mesmo com a modalidade junto', () => {
		expect(locationWithoutWorkMode('São Paulo, SP')).toBe('São Paulo, SP')
		expect(locationWithoutWorkMode('Remoto (Brasil)')).toBe('Remoto (Brasil)')
		expect(locationWithoutWorkMode(null)).toBeNull()
	})
})

// Textos no formato dos posts coletados (empresas e contatos trocados)
describe('keepContractTypesInPost', () => {
	test('post com PJ sai com PJ', () => {
		const text = `🚀 Vaga: Desenvolvedor(a) Front-end Vue.js Pleno

📍 100% remoto
💼 Contratação: PJ
💰 Faixa: a combinar

Interessados, mandar CV para vagas@empresa.com.br`

		expect(keepContractTypesInPost(['pj'], text)).toEqual(['pj'])
		// O texto basta: o modelo às vezes deixa o regime de fora
		expect(keepContractTypesInPost(null, text)).toEqual(['pj'])
	})

	test('post com CLT sai com CLT, mesmo em negrito Unicode', () => {
		const text = `Estamos contratando! 𝐃𝐞𝐬𝐞𝐧𝐯𝐨𝐥𝐯𝐞𝐝𝐨𝐫 𝐅𝐮𝐥𝐥 𝐒𝐭𝐚𝐜𝐤 (Node + React)
Regime 𝐂𝐋𝐓 com VR, VA e plano de saúde. Híbrido em Campinas/SP.`

		expect(keepContractTypesInPost(['clt'], text)).toEqual(['clt'])
	})

	test('post com "CLT ou PJ" guarda os dois', () => {
		const text = 'Tech Lead Java | Remoto | Contrato CLT ou PJ (a combinar). Candidate-se: https://empresa.com/vagas/42'

		expect(keepContractTypesInPost(['pj'], text)).toEqual(['clt', 'pj'])
		expect(keepContractTypesInPost(null, 'Modelo de contratação: CLT/PJ')).toEqual(['clt', 'pj'])
		expect(keepContractTypesInPost(null, 'Aceitamos pessoa jurídica')).toEqual(['pj'])
	})

	test('post sem regime fica sem regime, mesmo que o modelo invente', () => {
		const text = `Oportunidade para Desenvolvedor Python Sênior na área de dados.
Requisitos: Python, Airflow, SQL e AWS. Envie seu currículo pelo link do post.`

		expect(keepContractTypesInPost(null, text)).toBeNull()
		expect(keepContractTypesInPost(['clt', 'freelance'], text)).toBeNull()
	})

	test('estágio e freelance precisam do modelo e do texto', () => {
		const internship = 'Vaga de Estágio em Desenvolvimento Web (Vue.js), 6h por dia, bolsa-auxílio.'
		expect(keepContractTypesInPost(['estagio'], internship)).toEqual(['estagio'])
		// "estágio" também aparece em outros sentidos: sem o modelo, não entra
		expect(keepContractTypesInPost(null, 'Processo seletivo no estágio final, vaga de Dev Go')).toBeNull()

		expect(keepContractTypesInPost(['freelance'], 'Procuro dev Vue para um projeto freela de 2 meses')).toEqual(['freelance'])
		expect(keepContractTypesInPost(['freelance'], 'Freelancer job: React Native app')).toEqual(['freelance'])
		expect(keepContractTypesInPost(['estagio'], 'Internship: Software Engineer Intern (Python)')).toEqual(['estagio'])
	})

	test('não confunde a sigla com parte de outra palavra', () => {
		expect(keepContractTypesInPost(null, 'Dev para o sistema PJe (Processo Judicial Eletrônico)')).toBeNull()
		expect(keepContractTypesInPost(null, 'Experiência com CLTool e PJAX')).toBeNull()
	})
})

// Textos no formato dos posts coletados (empresas e contatos trocados)
describe('keepSenioritiesInPost', () => {
	test('o nível do cargo manda, mesmo sem o modelo', () => {
		expect(keepSenioritiesInPost(null, 'Desenvolvedor(a) Front-end Pleno', 'Vaga 100% remota')).toEqual(['pleno'])
		expect(keepSenioritiesInPost(['pleno'], 'Sr. Backend Engineer (Node.js)', 'Vaga com Node')).toEqual(['senior'])
		expect(keepSenioritiesInPost(null, 'Senior Software Engineer', '')).toEqual(['senior'])
		expect(keepSenioritiesInPost(null, 'Analista de Sistemas PL', '')).toEqual(['pleno'])
		expect(keepSenioritiesInPost(null, 'Tech Lead Java', '')).toEqual(['especialista'])
		expect(keepSenioritiesInPost(null, 'Dev Front-end 𝐒𝐞̂𝐧𝐢𝐨𝐫', '')).toEqual(['senior'])
	})

	test('"Pleno/Sênior" no cargo guarda os dois', () => {
		expect(keepSenioritiesInPost(['senior'], 'Desenvolvedor Java Pleno/Sênior', '')).toEqual(['pleno', 'senior'])
		expect(keepSenioritiesInPost(null, 'Dev Júnior a Pleno', '')).toEqual(['junior', 'pleno'])
	})

	test('sem nível no cargo, vale o que o modelo indicou e está escrito no post', () => {
		const text = `🚀 Estamos contratando: Desenvolvedor(a) Vue.js
Buscamos uma pessoa de nível sênior para liderar a migração do nosso front-end.
Requisitos: Vue 3, TypeScript, Pinia. Modelo: remoto.`

		expect(keepSenioritiesInPost(['senior'], 'Desenvolvedor(a) Vue.js', text)).toEqual(['senior'])
		// Escrito, mas o modelo não indicou: no corpo, a palavra sozinha não basta
		expect(keepSenioritiesInPost(null, 'Desenvolvedor(a) Vue.js', text)).toBeNull()
		// O modelo deduziu pelos anos de experiência: não está escrito
		expect(keepSenioritiesInPost(['senior'], 'Dev Python', 'Requisitos: 5 anos de experiência com Python')).toBeNull()
	})

	test('"pleno domínio" e afins não são nível', () => {
		const text = `Vaga: Desenvolvedor Python
Requisitos: pleno domínio de Django, conhecimento pleno em SQL.
Empresa em pleno crescimento!`

		expect(keepSenioritiesInPost(['pleno'], 'Desenvolvedor Python', text)).toBeNull()
		expect(keepSenioritiesInPost(['pleno'], 'Desenvolvedor Python', 'Vaga para dev de nível pleno')).toEqual(['pleno'])
	})

	test('siglas e palavras comuns não viram nível', () => {
		expect(keepSenioritiesInPost(null, 'Desenvolvedor PL/SQL', '')).toBeNull()
		expect(keepSenioritiesInPost(null, 'Engenheiro de Plataforma', '')).toBeNull()
		expect(keepSenioritiesInPost(null, 'Senioridade a definir', '')).toBeNull()
		expect(keepSenioritiesInPost(['especialista'], 'Dev Vue', 'Atividade principal: manter o design system')).toBeNull()
	})

	test('sem nível no post', () => {
		expect(keepSenioritiesInPost(null, 'Desenvolvedor Back-end', 'Vaga para trabalhar com Go e Kafka')).toBeNull()
		expect(keepSenioritiesInPost(null, null, '')).toBeNull()
	})
})
