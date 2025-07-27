import mongoose, { Schema } from 'mongoose'
import amqplib from 'amqplib'
import AiJsonResponse from '../types/AiJsonResponse'
;(async function () {
	await mongoose.connect('mongodb://user:user@127.0.0.1:27017/jobs?authSource=admin')

	const Job = mongoose.model('Job', new Schema<AiJsonResponse>(), 'processed')

	const connection = await amqplib.connect('amqp://user:user@localhost')
	const channel = await connection.createChannel()

	const queue = 'storage'
	await channel.assertQueue(queue)

	console.log('Waiting for messages in queue:', queue)

	await channel.consume(queue, async msg => {
		if (!msg) return

		try {
			console.log(`${queue} - Received message with timestamp:`, msg.properties.timestamp)

			const data = JSON.parse(msg.content.toString())

			if (!data || !data.title || !data.company || !data.location || !data.link) {
				console.error('Invalid data format:', data)
				return channel.ack(msg)
			}

			await Job.create(data)
			console.log('Data saved to MongoDB:', data)
			channel.ack(msg)

			channel.assertQueue('send-discord-message')
			channel.sendToQueue('send-discord-message', Buffer.from(JSON.stringify(data)))
		} catch (error) {
			console.error('Error processing message:', error)
			channel.nack(msg, false, false) // Reject the message without requeueing
		}
	})
})()
