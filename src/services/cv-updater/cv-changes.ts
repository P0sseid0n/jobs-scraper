import type { CvChanges } from '@shared/contracts'

import type { ResumeContent, TailoredResume } from './resume/resume.types'
import type { TailoringReport } from './tailor-resume'

/**
 * O ajuste do currículo para a vaga, comparando a versão que entrou no PDF (`resume`) com o currículo base: a
 * apresentação só conta como trocada se ficou no PDF (ele volta à original quando passa de uma página).
 */
export function cvChanges(base: ResumeContent, resume: TailoredResume, report: TailoringReport): CvChanges {
	return {
		addedSkills: report.addedSkills.map(entry => entry.skill),
		removedSkills: report.removedSkills,
		summary: resume.summary.trim() === base.summary.trim() ? null : { before: base.summary, after: resume.summary },
		projects: resume.projects.map(project => project.name),
	}
}
