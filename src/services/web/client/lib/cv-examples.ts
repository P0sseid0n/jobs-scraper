// Os modelos do cv-updater entram no pacote do site (o .tex como texto, o PDF como arquivo): baixar, usar ou ver um
// não depende do servidor. Os PDFs são gerados com `bun cv:examples`.
import { t } from '@shared/i18n'

import devPdf from '../../../cv-updater/assets/cv.example.pdf' with { type: 'file' }
import devTex from '../../../cv-updater/assets/cv.example.tex' with { type: 'text' }
import neutralPdf from '../../../cv-updater/assets/cv.neutral.example.pdf' with { type: 'file' }
import neutralTex from '../../../cv-updater/assets/cv.neutral.example.tex' with { type: 'text' }

/** `pdfUrl`: o endereço do PDF compilado do modelo. */
export type CvExample = { fileName: string; title: string; description: string; tex: string; pdfUrl: string }

/** Os modelos de currículo base que o cv-updater entende, para começar a partir de um (o nome e a descrição no idioma escolhido). */
export function cvExamples(): readonly CvExample[] {
	const { neutral, developer } = t().cvExamples
	return [
		{ fileName: 'cv.neutral.example.tex', ...neutral, tex: neutralTex, pdfUrl: neutralPdf },
		{ fileName: 'cv.example.tex', ...developer, tex: devTex, pdfUrl: devPdf },
	]
}

/** Link de download do modelo, sem passar pelo servidor. */
export function exampleDownloadUrl(example: CvExample) {
	return `data:application/x-tex;charset=utf-8,${encodeURIComponent(example.tex)}`
}
