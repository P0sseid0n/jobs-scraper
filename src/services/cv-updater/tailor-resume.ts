import type { ResumeContent, TailoredResume } from './resume/resume.types'
import { mentionsSkill, normalizeSkill, skillAliases, unsupportedJobSkills } from './skills/skill-matching'
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

	/** Requisitos da vaga que a pessoa não tem e que não entraram no currículo: nada gerado pode citá-los. */
	unsupportedSkills: string[]

	/** Motivo de a apresentação da IA ter sido descartada (`null` = aceita). */
	summaryRejected: string | null
}

const SUMMARY_MIN = 120
const SUMMARY_MAX = 520

// Quem fala na apresentação é a própria pessoa: estas frases são de alguém a descrevendo de fora ("O perfil demonstra")
const OUTSIDE_VOICE = [
	/\b(o|este|esse) perfil\b/i,
	/\b(o|a) candidat[oa]\b/i,
	/\b(demonstra|complementa|evidencia|possui)\b/i,
	/\b(suas|seus) (habilidades|competências|conhecimentos)\b/i,
	/\bpara (esta|essa) (posição|vaga|oportunidade|função)\b/i,
	/\bconjunto de habilidades\b/i,
]

/** Monta o currículo da vaga: habilidades, projetos e experiência reordenados e a nova apresentação (se válida). */
export function tailorResumeToJob(
	cv: ResumeContent,
	job: TargetJob,
	suggestions: TailoringSuggestions | null,
): { cv: TailoredResume; report: TailoringReport } {
	const skills = buildSkillsSection(cv, job, suggestions)
	const projects = orderProjects(cv, suggestions)
	const experience = orderExperience(cv, [...skills.relevant, ...skills.added.map(entry => entry.skill)])
	const unsupported = unsupportedJobSkills(cv, job)
	const summary = validateSummary(suggestions?.summary, cv, unsupported)

	return {
		cv: { summary: summary.text, skills: skills.skills, projects, experience },
		report: {
			relevantSkills: skills.relevant,
			addedSkills: skills.added,
			removedSkills: skills.removed,
			unsupportedSkills: unsupported,
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
 * Valida o tamanho da apresentação, se ela fala da pessoa de fora (`OUTSIDE_VOICE`) e se cita requisitos da vaga que a
 * pessoa não tem (as tecnologias adicionadas podem ser citadas).
 * @returns O texto a usar (a original, se rejeitada) e o motivo da rejeição, ou `null`.
 */
function validateSummary(candidate: string | undefined, cv: ResumeContent, unsupported: string[]) {
	const text = candidate?.trim().replace(/\s+/g, ' ')

	if (!text) return { text: cv.summary, rejected: 'vazia' }

	if (text.length < SUMMARY_MIN || text.length > SUMMARY_MAX) {
		return { text: cv.summary, rejected: `tamanho ${text.length} fora de ${SUMMARY_MIN}-${SUMMARY_MAX}` }
	}

	const outside = OUTSIDE_VOICE.map(pattern => text.match(pattern)?.[0]).find(Boolean)
	if (outside) return { text: cv.summary, rejected: `descreve a pessoa de fora ("${outside}"); escreva como ela se apresentando` }

	const invented = unsupported.filter(skill => mentionsSkill(text, skill))
	if (invented.length > 0) {
		return { text: cv.summary, rejected: `cita o que não está no currículo: ${invented.join(', ')}` }
	}

	return { text, rejected: null }
}
