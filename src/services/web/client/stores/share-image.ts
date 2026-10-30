import type { ShareCardOptions } from '@shared/templates'

import type { ShareCardFormat, ShareCardTitleSize } from '../components/ShareJobCard'
import { storage } from '../lib/storage'
import { createStore } from '../lib/store'

const KEY = 'shareImage'

/** As escolhas da imagem da vaga (o tema não entra: começa sempre no do site). */
export type ShareImagePrefs = ShareCardOptions & { format: ShareCardFormat; titleSize: ShareCardTitleSize }

const DEFAULTS: ShareImagePrefs = { format: 'post', titleSize: 'large', qr: true, skills: true, description: true }

const stored = storage.get<Partial<Record<keyof ShareImagePrefs, unknown>>>(KEY, {})

/** Só o que ainda é uma opção válida: uma versão antiga ou editada à mão não quebra a modal. */
function read(): ShareImagePrefs {
	return {
		format: stored.format === 'story' ? 'story' : 'post',
		titleSize: stored.titleSize === 'small' ? 'small' : 'large',
		qr: typeof stored.qr === 'boolean' ? stored.qr : DEFAULTS.qr,
		skills: typeof stored.skills === 'boolean' ? stored.skills : DEFAULTS.skills,
		description: typeof stored.description === 'boolean' ? stored.description : DEFAULTS.description,
	}
}

/** O formato, o tamanho do título e o que aparece na imagem da vaga. Lembrado entre visitas: quem faz story não escolhe de novo. */
export const shareImagePrefs = createStore<ShareImagePrefs>(read())

shareImagePrefs.subscribe(() => storage.set(KEY, shareImagePrefs.get()))
