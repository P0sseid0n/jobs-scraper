import ollama from 'ollama'
import amqplib from 'amqplib'
import { jsonrepair } from 'jsonrepair'
import AiJsonResponse from '../types/AiJsonResponse'
;(async function () {
	const connection = await amqplib.connect('amqp://user:user@localhost')
	const channel = await connection.createChannel()

	const queue = 'post_processing'
	await channel.assertQueue(queue)
	await channel.prefetch(1)

	console.log('Waiting for messages in queue:', queue)

	await channel.consume(
		queue,
		async msg => {
			if (!msg) return

			const expectedResponse = `{
            "title": "string",
            "company": "string",
            "location": "string",
            "link": "string",
            "necessary_knowledge": ["string"],
            "recruiter_email": "string",
            "workMode": "remoto | presencial | hibrido",
            "aiJobConfidence": 0
        }`.replace(/\n/g, '')

			try {
				console.log(`${queue} - Received message with timestamp:`, msg.properties.timestamp)
				const response = await ollama.chat({
					model: 'gemma3:4b',
					messages: [
						{
							role: 'user',
							content: `Leia a seguinte postagem e retorne **exatamente um único JSON em uma única linha**, sem explicações nem texto extra. O formato do JSON deve ser este: ${expectedResponse}.`,
						},
						{
							role: 'user',
							content: `Se **menos de 3 campos puderem ser preenchidos**, retorne **apenas a palavra: null**. Não escreva nenhum outro texto além de "null".`,
						},
						{
							role: 'user',
							content: `Preencha os campos ausentes com **null**. O campo "aiJobConfidence" deve conter um número de 0 a 100 representando sua certeza de que a postagem é uma vaga de emprego.`,
						},
						{
							role: 'user',
							content: msg.content.toString(),
						},
					],
				})

				const jsonResponse = jsonrepair(response.message.content)

				console.log('Raw Response from model:', jsonResponse)

				if (!jsonResponse || jsonResponse === 'null') {
					console.error('Received invalid response:', jsonResponse)
					return
				}

				channel.ack(msg)

				const cleaned = {
					rawContent: msg.content.toString(),
					...JSON.parse(jsonResponse),
				}

				console.log('Response from model:', cleaned)

				channel.assertQueue('storage')
				channel.sendToQueue('storage', Buffer.from(JSON.stringify(cleaned)))
			} catch (error) {
				console.error('Error processing message:', error)
				channel.nack(msg, false, true)
			}
		},
		{}
	)
})()
