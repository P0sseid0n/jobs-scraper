import mongoose, { Schema } from 'mongoose'

import { POST_IMAGE_TYPES, type PostImage, type PostImageType } from '../contracts/raw-post'

export type JobImageDocument = {
	postId: string
	/** Posição da imagem no post (0 é a primeira). */
	index: number
	mimeType: PostImageType
	data: Buffer
	createdAt: Date
}

/**
 * Imagens dos posts das vagas, baixadas na coleta: as URLs do LinkedIn expiram, então o site e o Discord as leem
 * daqui. Ficam enquanto a vaga existir (ligadas a ela pelo `postId`), fora do documento da vaga para a lista não
 * carregá-las.
 */
const jobImageSchema = new Schema<JobImageDocument>(
	{
		postId: { type: String, required: true },
		index: { type: Number, required: true },
		mimeType: { type: String, enum: POST_IMAGE_TYPES, required: true },
		data: { type: Buffer, required: true },
		createdAt: { type: Date, required: true },
	},
	{ versionKey: false },
)

jobImageSchema.index({ postId: 1, index: 1 }, { unique: true })

export const JobImage = mongoose.model('JobImage', jobImageSchema, 'job_images')

/** Guarda as imagens do post (uma única vez: reprocessar a mensagem não as duplica nem as troca). */
export async function saveJobImages(postId: string, images: PostImage[]) {
	if (images.length === 0) return

	const createdAt = new Date()
	await JobImage.bulkWrite(
		images.map((image, index) => ({
			updateOne: {
				filter: { postId, index },
				update: {
					$setOnInsert: { postId, index, mimeType: image.mimeType, data: Buffer.from(image.data, 'base64'), createdAt },
				},
				upsert: true,
			},
		})),
	)
}

/** Uma imagem guardada da vaga, ou `null` se não houver. */
export function findJobImage(postId: string, index: number) {
	// Sem `.lean()`: com ele o `data` vem como `Binary` do BSON, não como Buffer
	return JobImage.findOne({ postId, index }, { mimeType: 1, data: 1 })
}
