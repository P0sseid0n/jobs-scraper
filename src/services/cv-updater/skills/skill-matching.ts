import { knownTechnologies } from '../projects/tech-catalog'
import type { ResumeContent } from '../resume/resume.types'
import type { TargetJob } from '../target-job'

/** Normaliza o nome de uma habilidade para comparação: "Vue 3" ≈ "Vue.js" ≈ "vue". */
export function normalizeSkill(value: string) {
	return (
		value
			.normalize('NFD')
			.replace(/\p{Diacritic}/gu, '')
			.toLowerCase()
			.replace(/\.js\b|\bjs\b/g, '')
			// Versões no nome: "JavaScript ES6+" ≈ "JavaScript", "Vue 3" ≈ "Vue"
			.replace(/\b(es\d+|v\d+)\+?(?=\s|$)/g, '')
			.replace(/\s*\d+(\.\d+)*\+?\s*$/, '')
			.replace(/[^a-z0-9#+]/g, '')
	)
}

/** Lista os nomes pelos quais um item pode aparecer numa vaga: "CSS (SASS/SCSS)" → css, sass, scss. */
export function skillAliases(item: string) {
	return new Set(
		skillParts(item)
			.map(normalizeSkill)
			.filter(alias => alias.length > 0),
	)
}

/** Separa o item nas partes que valem sozinhas: "Tráfego pago (Google Ads, Meta Ads)" → o nome e cada parêntese. */
function skillParts(item: string) {
	const inside = item.match(/\(([^)]*)\)/)?.[1] ?? ''
	const outside = item.replace(/\([^)]*\)/g, '')

	return [outside, ...outside.split('/'), ...inside.split(/[/,]/)]
}

/**
 * Encontra os itens do currículo pedidos pela vaga, na ordem da vaga. Um requisito bate com um item pelo nome
 * ("CSS3/SCSS" ↔ "CSS (SASS/SCSS)") ou quando as palavras de um estão todas no outro: "Git workflows" ↔ "Git",
 * "Gestão de tráfego pago" ↔ "Tráfego pago (Google Ads)", "Atendimento humanizado" ↔ "Atendimento humanizado ao paciente".
 */
export function matchJobSkills(cv: ResumeContent, jobSkills: string[]) {
	const items = cv.skills.flatMap(group => group.items)
	const matched: string[] = []

	for (const skill of jobSkills) {
		const aliases = skillAliases(skill)
		const skillWords = skillParts(skill).map(significantWords)
		const item = items.find(candidate => {
			if ([...skillAliases(candidate)].some(alias => aliases.has(alias))) return true

			const candidateWords = skillParts(candidate).map(significantWords)
			return skillWords.some(wanted => candidateWords.some(own => sameWords(wanted, own)))
		})

		if (item && !matched.includes(item)) matched.push(item)
	}

	return matched
}

/**
 * Lista as tecnologias da vaga que a pessoa não tem, para adicioná-las, com o nome do catálogo ("Node" → "Node.js").
 * Só entram tecnologias do catálogo: competências de outras áreas ("Google Ads", "Atendimento humanizado") que não
 * estão no currículo não são inventadas.
 */
export function skillsToAdd(cv: ResumeContent, job: TargetJob) {
	const added: string[] = []

	for (const skill of missingJobSkills(cv, job.necessaryKnowledge ?? [])) {
		const name = catalogName(skill)
		if (name && !added.includes(name)) added.push(name)
	}

	return added
}

/**
 * Lista os requisitos da vaga que a pessoa não tem e que não entram no currículo (não são tecnologias do catálogo):
 * a apresentação e a mensagem não podem citá-los.
 */
export function unsupportedJobSkills(cv: ResumeContent, job: TargetJob) {
	const jobSkills = job.necessaryKnowledge ?? []

	return missingJobSkills(cv, jobSkills).filter(skill => !catalogName(skill) && matchJobSkills(cv, [skill]).length === 0)
}

/** Diz se o texto cita o requisito: todas as palavras dele aparecem, aceitando o plural ("Excel avançado"). */
export function mentionsSkill(text: string, skill: string) {
	const wanted = significantWords(skill)
	const textWords = words(text)

	return wanted.length > 0 && wanted.every(word => textWords.some(other => sameWord(word, other)))
}

/** Nome da tecnologia no catálogo, se o requisito for uma delas ("Node" → "Node.js"). */
function catalogName(skill: string) {
	const aliases = skillAliases(skill)
	return knownTechnologies().find(tech => aliases.has(normalizeSkill(tech)))
}

/**
 * Filtra as tecnologias da vaga que não aparecem no currículo: nem como habilidade ou tecnologia de projeto,
 * nem com todas as palavras no texto (ex.: "REST APIs" ↔ "Integração de APIs RESTful").
 */
export function missingJobSkills(cv: ResumeContent, jobSkills: string[]) {
	const known = knownAliases(cv)
	const textWords = words(cv.fullText)

	return jobSkills.filter(skill => {
		const aliases = [...skillAliases(skill)]
		if (normalizeSkill(skill).length <= 1 || aliases.some(alias => known.has(alias))) return false

		const significant = significantWords(skill)
		const inText = significant.length > 0 && significant.every(word => textWords.some(textWord => textWord.startsWith(word)))

		return !inText
	})
}

/** Reúne os aliases das habilidades e das tecnologias de projeto do currículo. */
function knownAliases(cv: ResumeContent) {
	const known = new Set(cv.skills.flatMap(group => group.items).flatMap(item => [...skillAliases(item)]))

	for (const project of cv.projects) {
		for (const tech of project.technologies) known.add(normalizeSkill(tech))
	}

	return known
}

function significantWords(skill: string) {
	return words(skill).filter(word => !GENERIC_WORDS.has(word))
}

/** Diz se as palavras de um lado estão todas no outro, aceitando o plural ("protocolo" ↔ "protocolos"). */
function sameWords(a: string[], b: string[]) {
	if (a.length === 0 || b.length === 0) return false

	const [fewer, more] = a.length <= b.length ? [a, b] : [b, a]
	return fewer.every(word => more.some(other => sameWord(word, other)))
}

function sameWord(a: string, b: string) {
	const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
	return longer === shorter || longer === `${shorter}s` || longer === `${shorter}es`
}

function words(text: string) {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.split(/[^a-z0-9#+]+/)
		.filter(Boolean)
}

// Palavras genéricas e preposições em nomes de requisitos ("REST APIs", "Git workflows", "Protocolo de segurança do paciente")
const GENERIC_WORDS = new Set([
	'api',
	'apis',
	'integration',
	'integracao',
	'development',
	'desenvolvimento',
	'framework',
	'frameworks',
	'architecture',
	'arquitetura',
	'workflow',
	'workflows',
	'services',
	'service',
	'tools',
	'and',
	'of',
	'in',
	'the',
	'with',
	'for',
	'de',
	'do',
	'da',
	'dos',
	'das',
	'e',
	'em',
	'no',
	'na',
	'nos',
	'nas',
	'ao',
	'aos',
	'a',
	'o',
	'para',
	'com',
])
