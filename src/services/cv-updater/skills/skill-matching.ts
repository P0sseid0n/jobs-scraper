import type { ResumeContent } from '../resume/resume.types'
import type { TargetJob } from '../target-job'

/** Normaliza o nome de uma tecnologia para comparação: "Vue 3" ≈ "Vue.js" ≈ "vue". */
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
	const inside = item.match(/\(([^)]*)\)/)?.[1] ?? ''
	const outside = item.replace(/\([^)]*\)/g, '')
	const parts = [outside, ...outside.split('/'), ...inside.split(/[/,]/)]

	return new Set(parts.map(normalizeSkill).filter(alias => alias.length > 0))
}

/** Encontra os itens do currículo pedidos pela vaga, na ordem da vaga. */
export function matchJobSkills(cv: ResumeContent, jobSkills: string[]) {
	const items = cv.skills.flatMap(group => group.items)
	const matched: string[] = []

	for (const skill of jobSkills) {
		// Requisitos compostos ("CSS3/SCSS") batem se qualquer parte bater; "Git workflows" bate pela palavra "git"
		const wanted = [...skillAliases(skill), ...significantWords(skill).map(normalizeSkill)]
		const item = items.find(candidate => {
			const aliases = skillAliases(candidate)
			return wanted.some(alias => aliases.has(alias))
		})

		if (item && !matched.includes(item)) matched.push(item)
	}

	return matched
}

/** Lista as tecnologias da vaga que a pessoa não tem (sem conceitos nem duplicatas), para adicioná-las. */
export function skillsToAdd(cv: ResumeContent, job: TargetJob) {
	const seen = new Set<string>()

	return missingJobSkills(cv, job.necessary_knowledge ?? []).filter(skill => {
		if (isConcept(skill)) return false

		const key = normalizeSkill(skill)
		if (seen.has(key)) return false

		seen.add(key)
		return true
	})
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

/** Diz se o requisito é um conceito ou metodologia ("Agile/Scrum"), e não uma tecnologia. */
export function isConcept(skill: string) {
	return words(skill).some(word => CONCEPT_WORDS.has(word))
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

function words(text: string) {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.split(/[^a-z0-9#+]+/)
		.filter(Boolean)
}

// Palavras genéricas em nomes de requisitos ("REST APIs", "Git workflows") que não indicam uma tecnologia
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
	'de',
	'e',
	'com',
])

// Termos que indicam conceito ou metodologia, não uma tecnologia
const CONCEPT_WORDS = new Set([
	'architecture',
	'arquitetura',
	'driven',
	'design',
	'pattern',
	'patterns',
	'principles',
	'practices',
	'methodology',
	'methodologies',
	'metodologia',
	'metodologias',
	'agile',
	'agil',
	'scrum',
	'kanban',
	'communication',
	'comunicacao',
	'teamwork',
	'leadership',
	'lideranca',
])
