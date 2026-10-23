import type { RunsPageSize } from '../../api-types'
import { storage } from '../lib/storage'
import { createStore } from '../lib/store'

const KEY = 'runsPageSize'

/** Os tamanhos que a seleção oferece (os mesmos que a API aceita). */
export const RUNS_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const satisfies readonly RunsPageSize[]

const stored = storage.get<unknown>(KEY, 20)

/** Quantas coletas cada página do histórico mostra. Lembrado entre visitas. */
export const runsPageSize = createStore<RunsPageSize>(RUNS_PAGE_SIZE_OPTIONS.find(size => size === stored) ?? 20)

runsPageSize.subscribe(() => storage.set(KEY, runsPageSize.get()))
