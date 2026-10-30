import { z } from 'zod'

// As mesmas origens e status do `ScraperRun` (o banco não entra nos contratos, que vão também para o navegador)
const TRIGGER = z.enum(['schedule', 'manual', 'once'])

/**
 * Evento `scraper-run`: uma coleta começou (`started`, em andamento) ou terminou (`finished`, com o status final). Leva só
 * o mínimo para quem assina decidir o que recarregar: o resto da coleta fica no `ScraperRun`, no MongoDB. Também é a
 * resposta ao "coletar agora" com `requestId`: `accepted` (a coleta vai começar) ou `ignored` (já há uma em andamento).
 */
export const ScraperRunEventSchema = z.discriminatedUnion('phase', [
	z.object({ runId: z.string().min(1), phase: z.literal('started'), status: z.literal('running'), trigger: TRIGGER }),
	z.object({ runId: z.string().min(1), phase: z.literal('finished'), status: z.enum(['success', 'failed']), trigger: TRIGGER }),
	z.object({ requestId: z.string().min(1), phase: z.enum(['accepted', 'ignored']) }),
])

export type ScraperRunEvent = z.infer<typeof ScraperRunEventSchema>
