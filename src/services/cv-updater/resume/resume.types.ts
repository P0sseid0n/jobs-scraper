import type { SectionKey } from './latex-syntax'

/** Conteúdo do currículo em texto puro, usado pela IA e pelas validações. */
export type ResumeContent = {
	summary: string
	skills: { category: string; items: string[] }[]
	/** `url` é o texto exibido do link (ex.: github.com/usuario/projeto). */
	projects: { name: string; url?: string; description: string; technologies: string[] }[]
	experience: { header: string; bullets: string[] }[]
	/** Formação, certificações e idiomas, com o título do `.tex`: a IA os lê, mas eles não são reescritos. */
	otherSections: { title: string; text: string }[]
	/** Texto de todo o documento, para checar se um termo existe em algum lugar do currículo. */
	fullText: string
}

/** Currículo ajustado: mesmo conteúdo, reordenado e com nova apresentação. */
export type TailoredResume = Omit<ResumeContent, 'fullText' | 'otherSections'>

/** Projeto como aparece no currículo. */
export type ResumeProject = TailoredResume['projects'][number]

export type Range = { start: number; end: number }

export type ParsedResume = {
	tex: string
	model: ResumeContent
	sections: Partial<Record<SectionKey, Range>>
	/** Texto puro → trecho LaTeX original, para remontar o `.tex` a partir da ordem escolhida. */
	raw: {
		skillLines: Map<string, { prefix: string; items: Map<string, string> }>
		projects: Map<string, string>
		/** Rótulo das tecnologias nos projetos do `.tex` (ex.: "Tecnologias"), repetido nos projetos novos. */
		projectSkillsLabel: string
		bullets: Map<string, string>[]
	}
}
