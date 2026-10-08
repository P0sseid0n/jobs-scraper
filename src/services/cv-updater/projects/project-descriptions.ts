import type { Message } from 'ollama'
import { z } from 'zod'

import type { ProjectCandidate } from './project-ranking'

const DESCRIPTION_MIN = 40
const DESCRIPTION_MAX = 260

const SYSTEM_PROMPT = `You write project descriptions for a developer's résumé, in Brazilian Portuguese.
For each repository, write 1 or 2 sentences (at most 220 characters) saying what the project does and how, based ONLY on its description and README.
Match the style of the example. Do not list technologies (they are shown separately) and do not invent features.`

const DescriptionsSchema = z.object({
	projects: z.array(z.object({ repo: z.string(), description: z.string() })).default([]),
})

/** Monta o pedido à IA de descrições para os projetos que vieram só do GitHub. */
export function buildDescriptionRequest(candidates: ProjectCandidate[], example: string | undefined) {
	const repos = candidates.flatMap(candidate => (!candidate.fromTex && candidate.repo ? [candidate.repo] : []))
	const names = repos.map(repo => repo.name)

	const schema = z.object({
		projects: z.array(
			z.object({
				repo: names.length > 0 ? z.enum(names as [string, ...string[]]) : z.string(),
				description: z.string(),
			}),
		),
	})

	const content = repos
		.map(repo => `## ${repo.name}\nDescription: ${repo.description ?? 'none'}\nREADME: ${repo.readme || 'none'}`)
		.join('\n\n')

	const messages: Message[] = [
		{ role: 'system', content: `${SYSTEM_PROMPT}${example ? `\n\nExample: ${example}` : ''}` },
		{ role: 'user', content },
	]

	return { messages, format: z.toJSONSchema(schema), names }
}

/** Aplica as descrições geradas; uma fora do tamanho é trocada pela descrição do repositório. */
export function applyDescriptions(candidates: ProjectCandidate[], generated: { repo: string; description: string }[]) {
	return candidates.map(candidate => {
		if (candidate.fromTex || !candidate.repo) return candidate.project

		const repo = candidate.repo
		const description = generated
			.find(entry => entry.repo === repo.name)
			?.description.trim()
			.replace(/\s+/g, ' ')

		const valid = description && description.length >= DESCRIPTION_MIN && description.length <= DESCRIPTION_MAX

		return { ...candidate.project, description: valid ? description : (repo.description ?? candidate.project.description) }
	})
}

export function parseDescriptions(content: string) {
	return DescriptionsSchema.parse(JSON.parse(content)).projects
}
