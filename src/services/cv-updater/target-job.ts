import type { ProcessedJob } from '@shared/contracts'

/** Dados da vaga usados para ajustar o currículo. */
export type TargetJob = Pick<ProcessedJob, 'title' | 'company' | 'necessaryKnowledge' | 'rawContent'>

/** Vaga como o cv-updater a lê do banco: além do ajuste, o idioma e o e-mail decidem a mensagem de candidatura. */
export type CvJob = TargetJob & Pick<ProcessedJob, 'language' | 'recruiterEmail'>
