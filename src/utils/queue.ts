import amqplib from 'amqplib'

export async function createQueue(queueName: string) {
	const url = process.env.RABBITMQ_URL || 'amqp://user:user@localhost'
	const connection = await amqplib.connect(url)
	const channel = await connection.createChannel()

	await channel.assertQueue(queueName)
	return { connection, channel }
}
