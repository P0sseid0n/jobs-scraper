import { storage } from '../lib/storage'
import { createStore } from '../lib/store'

const KEY = 'filtersOpen'

/** Se o painel de filtros está aberto ao lado da lista; fechado, a vaga aberta ganha o espaço dele. Lembrado entre visitas. */
export const filtersOpen = createStore(storage.get(KEY, false))

filtersOpen.subscribe(() => storage.set(KEY, filtersOpen.get()))
