import type { ProcessedJob } from '@shared/contracts'

/** Dados da vaga usados para ajustar o currículo. */
export type TargetJob = Pick<ProcessedJob, 'title' | 'company' | 'necessary_knowledge' | 'rawContent'>
