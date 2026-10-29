import { storage } from '../lib/storage'
import { createStore } from '../lib/store'

const KEY = 'variablePickerOpen'

/** Se o painel "Variáveis disponíveis" do editor de modelo está aberto; fechado, fica só o título. Lembrado entre visitas. */
export const variablePickerOpen = createStore(storage.get(KEY, true))

variablePickerOpen.subscribe(() => storage.set(KEY, variablePickerOpen.get()))
