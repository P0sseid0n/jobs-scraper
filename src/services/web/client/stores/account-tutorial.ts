import { storage } from '../lib/storage'
import { createStore } from '../lib/store'

const KEY = 'accountTutorialOpen'

/** Se o tutorial da conta aparece ao lado do formulário no onboarding; fechado, vira o botão "como configurar". Lembrado entre visitas. */
export const accountTutorialOpen = createStore(storage.get(KEY, true))

accountTutorialOpen.subscribe(() => storage.set(KEY, accountTutorialOpen.get()))
