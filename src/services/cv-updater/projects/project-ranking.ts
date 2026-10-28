import type { ResumeProject } from '../resume/resume.types'
import { normalizeSkill, skillAliases } from '../skills/skill-matching'
import type { GithubRepo } from './github-repositories'
import { MAX_TECHNOLOGIES, repoTechnologies } from './tech-catalog'

export type ProjectCandidate = {
	project: ResumeProject

	/** O projeto já está no `.tex` (texto escrito pela pessoa): não precisa de descrição gerada. */
	fromTex: boolean

	repo: GithubRepo | null
	matches: string[]
	score: number
}

const SCORE_PER_MATCH = 10
const SCORE_DESCRIPTION = 3
const SCORE_TOPICS = 3
const SCORE_RECENT = 3
const SCORE_LINK = 3

// Projeto com push neste período conta como recente
const RECENT_MONTHS = 12

// Linguagens básicas aparecem em quase todo projeto web: valem menos que frameworks/bibliotecas
const SCORE_PER_BASIC_MATCH = 3
const BASIC_SKILLS = new Set(['javascript', 'typescript', 'html', 'css'])

/**
 * Ranqueia os projetos do GitHub e do `.tex` para a vaga: tecnologias da vaga (`scoreTechMatches`),
 * +3 por descrição e +3 por topics (os do `.tex` ganham os dois), +3 se teve push nos últimos 12 meses
 * e +3 se tem link do projeto publicado. Desempate em `compareCandidates`.
 */
export function rankProjects(
	texProjects: ResumeProject[],
	repos: GithubRepo[],
	jobSkills: string[],
	now = new Date(),
): ProjectCandidate[] {
	const candidates = texProjects.map(project => texCandidate(project, repos, jobSkills, now))

	for (const repo of repos) {
		if (candidates.some(candidate => candidate.repo === repo)) continue
		candidates.push(repoCandidate(repo, jobSkills, now))
	}

	return candidates.sort(compareCandidates)
}

/** Escolhe `count` projetos: os melhores com tecnologias da vaga, completando com os do `.tex`. */
export function selectProjects(ranked: ProjectCandidate[], count: number) {
	const matching = ranked.filter(candidate => candidate.matches.length > 0)
	const fallback = ranked.filter(candidate => candidate.fromTex && !matching.includes(candidate))

	return [...matching, ...fallback].slice(0, count)
}

/** Ordena as tecnologias do projeto com as da vaga primeiro, limitadas para caber numa linha. */
export function orderTechnologies(technologies: string[], jobSkills: string[]) {
	const isMatch = (tech: string) => matchingTechnologies([tech], jobSkills).length > 0
	const ordered = [...technologies.filter(isMatch), ...technologies.filter(tech => !isMatch(tech))]

	return ordered.slice(0, MAX_TECHNOLOGIES)
}

/** Retorna as tecnologias da vaga presentes no projeto. */
export function matchingTechnologies(technologies: string[], jobSkills: string[]) {
	const projectAliases = new Set(technologies.flatMap(tech => [...skillAliases(tech)]))

	return jobSkills.filter(skill => [...skillAliases(skill)].some(alias => projectAliases.has(alias)))
}

/** Pontua as tecnologias da vaga: +10 cada; linguagens básicas valem +3 (JavaScript e TypeScript contam como uma). */
export function scoreTechMatches(matches: string[]) {
	const basic = new Set<string>()
	let score = 0

	for (const skill of matches) {
		// Requisitos compostos ("CSS3/SCSS") contam como básicos se alguma parte for uma linguagem básica
		const key = [...skillAliases(skill)].find(alias => BASIC_SKILLS.has(alias))

		if (key) basic.add(key === 'typescript' ? 'javascript' : key)
		else score += SCORE_PER_MATCH
	}

	return score + basic.size * SCORE_PER_BASIC_MATCH
}

/** Cria o candidato de um projeto do `.tex`, somando as tecnologias do repositório correspondente. */
function texCandidate(project: ResumeProject, repos: GithubRepo[], jobSkills: string[], now: Date): ProjectCandidate {
	const repo = repos.find(candidate => sameProject(project, candidate)) ?? null
	const technologies = [...project.technologies, ...(repo ? repoTechnologies(repo) : [])]
	const matches = matchingTechnologies(technologies, jobSkills)

	return {
		project,
		fromTex: true,
		repo,
		matches,
		score: scoreTechMatches(matches) + SCORE_DESCRIPTION + SCORE_TOPICS + activityScore(repo, project.url, now),
	}
}

function repoCandidate(repo: GithubRepo, jobSkills: string[], now: Date): ProjectCandidate {
	const technologies = repoTechnologies(repo)
	const matches = matchingTechnologies(technologies, jobSkills)
	const dedication =
		(repo.description ? SCORE_DESCRIPTION : 0) + (repo.topics.length > 0 ? SCORE_TOPICS : 0) + activityScore(repo, null, now)

	return {
		project: {
			name: prettyRepoName(repo.name),
			url: repo.url.replace(/^https?:\/\//, ''),
			description: repo.description ?? '',
			technologies: technologies.slice(0, MAX_TECHNOLOGIES),
		},
		fromTex: false,
		repo,
		matches,
		score: scoreTechMatches(matches) + dedication,
	}
}

/**
 * Pontos de projeto vivo: push recente no repositório e link do projeto publicado (o "Website" do GitHub ou,
 * no `.tex`, um link que não é do GitHub).
 */
function activityScore(repo: GithubRepo | null, texUrl: string | null | undefined, now: Date) {
	const recentSince = new Date(now)
	recentSince.setMonth(recentSince.getMonth() - RECENT_MONTHS)

	const recent = repo !== null && new Date(repo.pushedAt) >= recentSince
	const link = Boolean(repo?.homepage) || Boolean(texUrl && !/github\.com/i.test(texUrl))

	return (recent ? SCORE_RECENT : 0) + (link ? SCORE_LINK : 0)
}

/** Ordena por pontuação; desempata por mais estrelas, mais tecnologias e mais recente. */
function compareCandidates(a: ProjectCandidate, b: ProjectCandidate) {
	const richness = (candidate: ProjectCandidate) =>
		candidate.repo ? repoTechnologies(candidate.repo).length : candidate.project.technologies.length
	const recency = (candidate: ProjectCandidate) => (candidate.repo ? new Date(candidate.repo.pushedAt).getTime() : 0)
	const stars = (candidate: ProjectCandidate) => candidate.repo?.stars ?? 0

	return b.score - a.score || stars(b) - stars(a) || richness(b) - richness(a) || recency(b) - recency(a)
}

function sameProject(project: ResumeProject, repo: GithubRepo) {
	const url = project.url?.toLowerCase() ?? ''

	return url.includes(repo.fullName.toLowerCase()) || normalizeSkill(project.name) === normalizeSkill(repo.name)
}

/** Formata o nome do repositório para exibição: "sistema-de-vendas" → "Sistema de Vendas". */
function prettyRepoName(name: string) {
	const lowercase = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'pra', 'para', 'com', 'na', 'no'])

	return name
		.split(/[-_]+/)
		.filter(Boolean)
		.map((word, index) =>
			index > 0 && lowercase.has(word.toLowerCase()) ? word.toLowerCase() : word[0]!.toUpperCase() + word.slice(1),
		)
		.join(' ')
}
