import type { Ollama } from 'ollama'

import type { Logger } from '@shared/logging'

import type { ParsedResume, ResumeProject } from '../resume/resume.types'
import type { TargetJob } from '../target-job'
import type { GithubRepositories } from './github-repositories'
import { applyDescriptions, buildDescriptionRequest, parseDescriptions } from './project-descriptions'
import { orderTechnologies, rankProjects, selectProjects, type ProjectCandidate } from './project-ranking'

type ChooseProjectsOptions = {
	/** Sem GitHub configurado, ficam os projetos do .tex. */
	github: GithubRepositories | null
	ollama: Ollama
	model: string
	maxProjects: number
}

/**
 * Projetos do GitHub mais relevantes para a vaga (ranking em project-ranking.ts).
 * Projetos que não estão no .tex ganham uma descrição escrita pela IA a partir do README.
 * Se o GitHub falhar, ficam os projetos do .tex (`fallback`).
 */
export async function chooseProjects(
	options: ChooseProjectsOptions,
	base: ParsedResume,
	fallback: ResumeProject[],
	job: TargetJob,
	log: Logger,
): Promise<ResumeProject[]> {
	if (!options.github) return fallback

	const jobSkills = job.necessary_knowledge ?? []

	try {
		const ranked = rankProjects(base.model.projects, await options.github.load(), jobSkills)
		const selected = selectProjects(ranked, options.maxProjects)

		log.info({ projects: selected.map(describeChoice) }, 'Projetos escolhidos')

		const descriptions = await describeNewProjects(options, selected, base.model.projects[0]?.description, log)

		return applyDescriptions(selected, descriptions).map((project, index) =>
			selected[index]!.fromTex ? project : { ...project, technologies: orderTechnologies(project.technologies, jobSkills) },
		)
	} catch (error) {
		log.warn({ err: error }, 'Falha ao buscar projetos no GitHub; usando os do currículo')
		return fallback
	}
}

/** Descrições geradas pela IA para os projetos que não estão no .tex (vazio se não houver nenhum ou se a IA falhar). */
async function describeNewProjects(
	options: ChooseProjectsOptions,
	selected: ProjectCandidate[],
	example: string | undefined,
	log: Logger,
) {
	const request = buildDescriptionRequest(selected, example)
	if (request.names.length === 0) return []

	try {
		const response = await options.ollama.chat({
			model: options.model,
			messages: request.messages,
			format: request.format,
			options: { temperature: 0.2 },
		})

		return parseDescriptions(response.message.content)
	} catch (error) {
		log.warn({ err: error }, 'Falha ao gerar a descrição dos projetos; usando a descrição do GitHub')
		return []
	}
}

function describeChoice(candidate: ProjectCandidate) {
	return `${candidate.project.name} (${candidate.score}: ${candidate.matches.join(', ')})`
}
