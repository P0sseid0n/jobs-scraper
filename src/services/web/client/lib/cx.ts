/** Junta as classes que valem (`cx('btn', big && 'btn-lg')`). */
export function cx(...classes: (string | false | null | undefined)[]) {
	return classes.filter(Boolean).join(' ')
}
