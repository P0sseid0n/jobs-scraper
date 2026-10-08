import mongoose, { Schema } from 'mongoose'

/** Todo post que já passou pela IA (sendo vaga ou não), para não reprocessar o mesmo conteúdo. */
const seenPostSchema = new Schema(
	{
		postId: { type: String, required: true, unique: true },
		isJob: { type: Boolean, required: true },
	},
	{ timestamps: true },
)

export const SeenPost = mongoose.model('SeenPost', seenPostSchema, 'seen_posts')
