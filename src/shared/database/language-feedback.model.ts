import mongoose, { Schema } from 'mongoose'

/**
 * Um post marcado pelo site como fora dos idiomas aceitos: o filtro de idioma (`@shared/language`) deixou passar.
 * Fica separado do `extraction_feedback`, porque o erro é do filtro, não da extração da IA.
 */
export type LanguageFeedbackRecord = {
	postId: string
	/** O texto do post, como passou pelo filtro. */
	text: string
	/** O idioma que o post-processing detectou e salvou na vaga; `null` se o texto era curto demais para detectar. */
	detectedLanguage: string | null
	/** Os idiomas aceitos quando o post foi marcado. */
	allowedLanguages: string[]
	createdAt: Date
}

const languageFeedbackSchema = new Schema<LanguageFeedbackRecord>({
	postId: { type: String, required: true, index: true },
	text: { type: String, required: true },
	detectedLanguage: { type: String, default: null },
	allowedLanguages: { type: [String], default: [] },
	createdAt: { type: Date, required: true },
})

export const LanguageFeedback = mongoose.model('LanguageFeedback', languageFeedbackSchema, 'language_feedback')
