import { tv } from '../../lib/cx'

/** A caixa com borda das telas (`<section className={card({ className: 'p-7' })}>`); o espaçamento vem de quem usa. */
export const card = tv({
	base: 'rounded-lg border border-line bg-surface',
	variants: {
		/** Contorno vermelho: o item falhou (currículo, termo da coleta). */
		failed: { true: 'border-danger' },
	},
})
