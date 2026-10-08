import type { ResumeContent, TailoredResume } from './resume/resume.types'
import { normalizeSkill, skillAliases } from './skills/skill-matching'
import { buildSkillsSection, orderBy, type AddedSkill } from './skills/skills-section'
import type { TailoringSuggestions } from './tailoring-prompt'
import type { TargetJob } from './target-job'

export type TailoringReport = {
	/** Habilidades do currículo relacionadas à vaga (ficam no currículo, em ordem de relevância). */
	relevantSkills: string[]

	/** Tecnologias da vaga adicionadas, com a categoria onde entraram. */
	addedSkills: AddedSkill[]

	/** Habilidades do currículo base que saíram por não terem relação com a vaga. */
	removedSkills: string[]

	/** Motivo de a apresentação da IA ter sido descartada (`null` = aceita). */
	summaryRejected: string | null
}

const SUMMARY_MIN = 120
const SUMMARY_MAX = 520

/** Monta o currículo da vaga: habilidades, projetos e experiência reordenados e a nova apresentação (se válida). */
export function tailorResumeToJob(
	cv: ResumeContent,
	job: TargetJob,
	suggestions: TailoringSuggestions | null,
): { cv: TailoredResume; report: TailoringReport } {
	const skills = buildSkillsSection(cv, job, suggestions)
	const projects = orderProjects(cv, suggestions)
	const experience = orderExperience(cv, [...skills.relevant, ...skills.added.map(entry => entry.skill)])
	const summary = validateSummary(suggestions?.summary, cv)

	return {
		cv: { summary: summary.text, skills: skills.skills, projects, experience },
		report: {
			relevantSkills: skills.relevant,
			addedSkills: skills.added,
			removedSkills: skills.removed,
			summaryRejected: summary.rejected,
		},
	}
}

/** Ordena os projetos pela sugestão da IA (só nomes existentes), seguidos dos demais. */
function orderProjects(cv: ResumeContent, suggestions: TailoringSuggestions | null) {
	const projectNames = new Set(cv.projects.map(project => project.name))
	const suggested = (suggestions?.relevantProjects ?? []).filter(name => projectNames.has(name))

	return orderBy(cv.projects, project => project.name, suggested)
}

/** Sobe os bullets de experiência que citam mais habilidades relevantes (ordem original no empate). */
function orderExperience(cv: ResumeContent, relevantSkills: string[]) {
	const aliases = relevantSkills.flatMap(skill => [...skillAliases(skill)])

	const score = (bullet: string) => {
		const words = new Set(bullet.split(/[\s,;()]+/).map(normalizeSkill))
		return aliases.filter(alias => words.has(alias)).length
	}

	return cv.experience.map(entry => ({
		...entry,
		bullets: entry.bullets
			.map((bullet, index) => ({ bullet, index, score: score(bullet) }))
			.sort((a, b) => b.score - a.score || a.index - b.index)
			.map(({ bullet }) => bullet),
	}))
}

/**
 * Valida só o tamanho da apresentação (ela pode citar as techs da vaga).
 * @returns O texto a usar (a original, se rejeitada) e o motivo da rejeição, ou `null`.
 */
function validateSummary(candidate: string | undefined, cv: ResumeContent) {
	const text = candidate?.trim().replace(/\s+/g, ' ')

	if (!text) return { text: cv.summary, rejected: 'vazia' }

	if (text.length < SUMMARY_MIN || text.length > SUMMARY_MAX) {
		return { text: cv.summary, rejected: `tamanho ${text.length} fora de ${SUMMARY_MIN}-${SUMMARY_MAX}` }
	}

	return { text, rejected: null }
}
