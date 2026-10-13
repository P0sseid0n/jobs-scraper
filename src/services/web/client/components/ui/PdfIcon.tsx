import type { ReactNode } from 'react'

import { cx } from '../../lib/cx'

/** A "folha" do currículo (decorativa); `dashed` enquanto ele está sendo gerado. */
export function PdfIcon({ dashed = false, children }: { dashed?: boolean; children: ReactNode }) {
	return (
		<span
			aria-hidden="true"
			className={cx(
				'grid h-11 w-9 shrink-0 place-items-center rounded-xs border border-line bg-surface font-mono text-xs',
				dashed && 'border-dashed text-lime-text',
			)}
		>
			{children}
		</span>
	)
}
