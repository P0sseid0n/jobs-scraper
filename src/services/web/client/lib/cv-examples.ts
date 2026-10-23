// Os modelos do cv-updater entram no pacote do site como texto: baixar ou usar um não depende do servidor
import devTex from '../../../cv-updater/assets/cv.example.tex' with { type: 'text' }
import neutralTex from '../../../cv-updater/assets/cv.neutral.example.tex' with { type: 'text' }

export type CvExample = { fileName: string; title: string; description: string; tex: string }

/** Os modelos de currículo base que o cv-updater entende, para começar a partir de um. */
export const CV_EXAMPLES: readonly CvExample[] = [
	{
		fileName: 'cv.neutral.example.tex',
		title: 'qualquer área',
		description: 'Resumo, competências, experiência, formação, certificações e idiomas, sem projetos (ex.: enfermagem).',
		tex: neutralTex,
	},
	{
		fileName: 'cv.example.tex',
		title: 'desenvolvedor',
		description: 'Apresentação, habilidades por categoria, projetos (que vêm do GitHub, se configurado) e experiência.',
		tex: devTex,
	},
]

/** Link de download do modelo, sem passar pelo servidor. */
export function exampleDownloadUrl(example: CvExample) {
	return `data:application/x-tex;charset=utf-8,${encodeURIComponent(example.tex)}`
}
