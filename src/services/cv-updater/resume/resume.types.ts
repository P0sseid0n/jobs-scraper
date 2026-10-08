import type { SECTION_TITLES } from './latex-syntax'

/** Conteúdo do currículo em texto puro, usado pela IA e pelas validações. */
export type ResumeContent = {
	summary: string
	skills: { category: string; items: string[] }[]
	/** `url` é o texto exibido do link (ex.: github.com/usuario/projeto). */
	projects: { name: string; url?: string; description: string; technologies: string[] }[]
	experience: { header: string; bullets: string[] }[]
	/** Texto de todo o documento, para checar se um termo existe em algum lugar do currículo. */
	fullText: string
}

/** Currículo ajustado: mesmo conteúdo, reordenado e com nova apresentação. */
export type TailoredResume = Omit<ResumeContent, 'fullText'>

/** Projeto como aparece no currículo. */
export type ResumeProject = TailoredResume['projects'][number]

export type Range = { start: number; end: number }

export type ParsedResume = {
	tex: string
	model: ResumeContent
	sections: Partial<Record<keyof typeof SECTION_TITLES, Range>>
	/** Texto puro → trecho LaTeX original, para remontar o `.tex` a partir da ordem escolhida. */
	raw: {
		skillLines: Map<string, { prefix: string; items: Map<string, string> }>
		projects: Map<string, string>
		bullets: Map<string, string>[]
	}
}
