import { router } from '../router'
import { reducedMotion } from './motion'

/**
 * O card da vaga que vira o detalhe, com a View Transitions API. Os elementos que podem animar levam `data-vt`; no
 * detalhe (o painel ao lado da lista ou a página da vaga), a caixa e o cargo têm os nomes da transição sempre
 * (`vt-job-card`, `vt-job-title`). No clique, o card e o cargo dele pegam esses nomes e os outros ficam sem: a tela de
 * antes tem só o card. O roteador troca de tela dentro da transição e, já com a tela nova, os nomes postos no clique
 * saem (`onLoad`): a de depois tem só o detalhe, e o navegador anima um no outro.
 *
 * No celular, "voltar" da página da vaga faz o caminho inverso: o card dela na lista recebe os nomes ao aparecer.
 */

let subscribed = false
/** A vaga cujo card recebe os nomes na lista que vai aparecer ("voltar" da página da vaga). */
let returning: string | null = null

/** O navegador tem a API e a pessoa não pediu menos movimento. */
export function canMorph() {
	return typeof document.startViewTransition === 'function' && !reducedMotion()
}

function setNames(card: HTMLElement | null, title: HTMLElement | null) {
	for (const element of document.querySelectorAll<HTMLElement>('[data-vt]')) element.style.viewTransitionName = 'none'
	if (card) card.style.viewTransitionName = 'job-card'
	if (title) title.style.viewTransitionName = 'job-title'
}

// O roteador é importado por quem importa este módulo: só pode ser usado depois de carregado, no primeiro clique
function follow() {
	if (subscribed) return
	subscribed = true

	router.subscribe('onLoad', () => {
		for (const element of document.querySelectorAll<HTMLElement>('[data-vt]')) element.style.viewTransitionName = ''
	})
	router.subscribe('onResolved', () => {
		returning = null
	})
}

/** No clique no card (antes da navegação, que precisa do `viewTransition` do `Link`): ele vira o detalhe. */
export function prepareJobMorph(card: HTMLElement) {
	if (!canMorph()) return

	follow()
	returning = null
	setNames(card, card.querySelector<HTMLElement>('[data-vt="title"]'))
}

/** Antes de voltar da página da vaga para a lista (celular): o detalhe vira o card da vaga, que fica com os nomes. */
export function prepareMorphBack(postId: string) {
	if (!canMorph()) return

	follow()
	returning = postId
	router.shouldViewTransition = true
}

/** O card desta vaga é o destino do "voltar" em andamento. */
export function isMorphTarget(postId: string) {
	return returning === postId
}

/** A lista está aparecendo pelo "voltar" animado: os cards não entram em cascata (a transição já anima). */
export function isMorphingBack() {
	return returning !== null
}
