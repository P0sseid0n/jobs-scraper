import type { HTMLAttributes, LabelHTMLAttributes } from 'react'

import { cx } from '../../lib/cx'

/** Nome do campo, acima dele; `htmlFor` é o `id` do campo. */
export function FieldLabel({ htmlFor, className, children, ...props }: LabelHTMLAttributes<HTMLLabelElement> & { htmlFor: string }) {
	return (
		<label htmlFor={htmlFor} {...props} className={cx('p-0 text-sm font-medium', className)}>
			{children}
		</label>
	)
}

/** Explicação do campo, abaixo dele (ligue ao campo com `aria-describedby`). */
export function FieldHelp({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
	return <p {...props} className={cx('text-sm leading-normal text-muted', className)} />
}

/** Erro de validação do campo, no lugar da explicação. */
export function FieldError({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
	return <p role="alert" {...props} className={cx('text-xs text-danger', className)} />
}
