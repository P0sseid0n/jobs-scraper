import { z } from 'zod'

import { booleanFromEnv } from '@shared/config'

export const webEnv = {
	/** No Docker, use 0.0.0.0 (a porta é publicada só em 127.0.0.1 pelo docker-compose). */
	WEB_HOST: z.string().min(1).default('127.0.0.1'),
	WEB_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
	/**
	 * `true`: o site não abre o onboarding (tudo configurado pelo `.env`). `false`: abre enquanto falta o mínimo, com os
	 * campos já preenchidos pelo `.env` e editáveis.
	 */
	SKIP_ONBOARDING: booleanFromEnv.default(false),
}
