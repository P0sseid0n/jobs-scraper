/** Selo neutro de um dado da vaga (nível, regime); some quando o post não diz, para não poluir o card. */
export function TextBadge({ label = null }: { label?: string | null }) {
	return label ? <span className="text-badge mono">{label}</span> : null
}
