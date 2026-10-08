import type { ResumeContent } from '../resume/resume.types'
import { SKIP_CATEGORY, type TailoringSuggestions } from '../tailoring-prompt'
import type { TargetJob } from '../target-job'
import { matchJobSkills, normalizeSkill, skillsToAdd } from './skill-matching'

export type AddedSkill = { skill: string; category: string }

export type SkillsSection = {
	skills: ResumeContent['skills']

	/** Habilidades do currículo relacionadas à vaga, em ordem de relevância. */
	relevant: string[]

	/** Tecnologias da vaga que entraram no currículo, com a categoria onde entraram. */
	added: AddedSkill[]

	/** Habilidades do currículo base que saíram por não terem relação com a vaga. */
	removed: string[]
}

/** Abaixo disso, a seção de habilidades é completada com as próximas do currículo, para não ficar vazia. */
const MIN_OWN_SKILLS = 8

// Nuvem e DevOps vão sempre para a categoria de ferramentas (o modelo pequeno costuma errar essas)
const TOOLS_SKILLS = new Set(
	['AWS', 'Azure', 'GCP', 'Google Cloud', 'Kubernetes', 'Docker', 'Terraform', 'Jenkins', 'CI/CD', 'GitHub Actions', 'GitLab CI'].map(
		normalizeSkill,
	),
)

/**
 * Habilidades do currículo para a vaga: entram as tecnologias pedidas (inclusive as que a pessoa não tinha)
 * e ficam só as categorias relacionadas à vaga, com o que a vaga pede primeiro.
 */
export function buildSkillsSection(cv: ResumeContent, job: TargetJob, suggestions: TailoringSuggestions | null): SkillsSection {
	const jobSkills = job.necessary_knowledge ?? []

	// Habilidades da pessoa: as pedidas pela vaga + as que a IA considerou relacionadas (só nomes que existem)
	const fromJob = matchJobSkills(cv, jobSkills)
	const fromModel = matchJobSkills(cv, suggestions?.relevantSkills ?? [])
	const relevant = [...new Set([...fromJob, ...fromModel])]

	const added = classifyAddedSkills(cv, job, suggestions)
	const kept = keptOwnSkills(cv, fromJob, relevant, added)
	const priority = [...jobOrder(cv, jobSkills, added), ...fromModel]

	return {
		skills: buildCategories(cv, added, kept, priority),
		relevant,
		added,
		removed: cv.skills.flatMap(group => group.items).filter(item => !kept.has(item)),
	}
}

/** Tecnologias da vaga que a pessoa não tinha, na categoria escolhida pela IA (ou na de ferramentas). */
function classifyAddedSkills(cv: ResumeContent, job: TargetJob, suggestions: TailoringSuggestions | null): AddedSkill[] {
	const categories = cv.skills.map(group => group.category)
	const toAdd = skillsToAdd(cv, job)

	const classified = new Map<string, string>()
	for (const { skill, category } of suggestions?.addedSkills ?? []) {
		const match = toAdd.find(candidate => normalizeSkill(candidate) === normalizeSkill(skill))
		const validCategory = categories.includes(category) || category === SKIP_CATEGORY

		if (match && validCategory) classified.set(match, category)
	}

	const toolsCategory = fallbackCategory(categories)

	return toAdd
		.map(skill => ({
			skill,
			category: TOOLS_SKILLS.has(normalizeSkill(skill)) ? toolsCategory : (classified.get(skill) ?? toolsCategory),
		}))
		.filter(({ category }) => category !== SKIP_CATEGORY)
}

/**
 * Habilidades da pessoa que ficam: as relevantes + todas das categorias relacionadas à vaga
 * (categoria com alguma tech da vaga, dela ou adicionada). Se sobrar pouco, completa na ordem original.
 */
function keptOwnSkills(cv: ResumeContent, fromJob: string[], relevant: string[], added: AddedSkill[]) {
	const isRelated = (group: ResumeContent['skills'][number]) =>
		group.items.some(item => fromJob.includes(item)) || added.some(entry => entry.category === group.category)

	const related = [...relevant, ...cv.skills.filter(isRelated).flatMap(group => group.items)]
	const missing = Math.max(0, MIN_OWN_SKILLS - new Set(related).size)
	const fillers = cv.skills
		.flatMap(group => group.items)
		.filter(item => !related.includes(item))
		.slice(0, missing)

	return new Set([...related, ...fillers])
}

/** Ordem de importância segundo a vaga, com os itens da pessoa e os adicionados intercalados. */
function jobOrder(cv: ResumeContent, jobSkills: string[], added: AddedSkill[]) {
	return jobSkills.flatMap(skill => {
		const own = matchJobSkills(cv, [skill])[0]
		const addedSkill = added.find(entry => normalizeSkill(entry.skill) === normalizeSkill(skill))?.skill

		return [own, addedSkill].filter((value): value is string => Boolean(value))
	})
}

/** Monta as linhas de habilidades: itens ordenados pela prioridade e categorias com mais itens da vaga primeiro. */
function buildCategories(cv: ResumeContent, added: AddedSkill[], kept: Set<string>, priority: string[]) {
	return cv.skills
		.map((group, index) => {
			const items = [
				...added.filter(entry => entry.category === group.category).map(entry => entry.skill),
				...group.items.filter(item => kept.has(item)),
			]

			return { category: group.category, items: orderBy(items, item => item, priority), index }
		})
		.filter(group => group.items.length > 0)
		.map(group => ({ ...group, hits: group.items.filter(item => priority.includes(item)).length }))
		.sort((a, b) => b.hits - a.hits || a.index - b.index)
		.map(({ category, items }) => ({ category, items }))
}

/** Categoria usada quando a IA não classificou uma tech da vaga: "Ferramentas"/"Tools", ou a última. */
function fallbackCategory(categories: string[]) {
	return categories.find(category => /ferrament|tool/i.test(category)) ?? categories.at(-1)!
}

/** Ordena pelos itens de `selected` primeiro (na ordem deles); os demais mantêm a ordem original. */
export function orderBy<T>(items: T[], key: (item: T) => string, selected: string[]) {
	const rank = (item: T) => {
		const index = selected.indexOf(key(item))
		return index === -1 ? Number.MAX_SAFE_INTEGER : index
	}

	return [...items].sort((a, b) => rank(a) - rank(b))
}
