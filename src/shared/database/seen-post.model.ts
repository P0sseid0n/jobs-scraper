import mongoose, { Schema } from 'mongoose'

/**
 * Destino de cada post no post-processing: `saved` virou vaga; `multi-job` listava várias vagas (cada uma é aberta
 * à parte); os outros são motivos de descarte, na ordem em que os filtros rodam.
 */
export const SEEN_POST_OUTCOMES = ['saved', 'multi-job', 'language', 'job-seeker', 'not-a-job', 'keywords', 'missing-fields'] as const

export type SeenPostOutcome = (typeof SEEN_POST_OUTCOMES)[number]

/** Todo post que já passou pela IA (sendo vaga ou não), para não reprocessar o mesmo conteúdo. */
const seenPostSchema = new Schema(
	{
		postId: { type: String, required: true, unique: true },
		isJob: { type: Boolean, required: true },
		/** Ausente nos posts processados antes de o destino ser registrado. */
		outcome: { type: String, enum: SEEN_POST_OUTCOMES },
	},
	{ timestamps: true },
)

export const SeenPost = mongoose.model('SeenPost', seenPostSchema, 'seen_posts')
