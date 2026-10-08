import { z } from 'zod'

export const cvUpdaterEnv = {
	/** Currículo base em LaTeX; é relido a cada pedido, então dá para editar sem reiniciar o serviço. */
	CV_TEX_FILE: z.string().min(1).default('data/cv/cv.tex'),
	/** Fontes usadas pelo .tex (ex.: Nunito-Regular.otf); dispensam ter a fonte instalada no sistema. */
	CV_FONTS_DIR: z.string().min(1).default('src/services/cv-updater/assets/fonts'),
	/** Onde ficam os PDFs gerados (histórico local). */
	CV_OUTPUT_DIR: z.string().min(1).default('data/cv/generated'),
	/** Executável do Tectonic (compilador LaTeX). */
	TECTONIC_BIN: z.string().min(1).default('tectonic'),
	/** Quantidade de projetos no currículo (diminui só se não couber em uma página). */
	CV_MAX_PROJECTS: z.coerce.number().int().min(1).default(2),
	/** Cache local (ex.: repositórios do GitHub). */
	CV_CACHE_DIR: z.string().min(1).default('data/cache'),
	/** Usuário do GitHub para escolher os projetos mais relevantes para cada vaga. Sem ele, ficam os projetos do .tex. */
	GITHUB_USERNAME: z.string().trim().min(1).optional(),
	/** Opcional: sem token, a API do GitHub permite só 60 requisições por hora. */
	GITHUB_TOKEN: z.string().trim().min(1).optional(),
	/** Repositórios que nunca entram no currículo, separados por vírgula. */
	GITHUB_EXCLUDE_REPOS: z
		.string()
		.default('')
		.transform(value =>
			value
				.split(',')
				.map(name => name.trim())
				.filter(Boolean),
		),
	GITHUB_CACHE_HOURS: z.coerce.number().positive().default(24),
}
