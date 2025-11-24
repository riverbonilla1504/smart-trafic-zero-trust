// src/rabbitClient.js
const amqplib = require("amqplib");
const { settings } = require("./config");

// RabbitMQ client class
class RabbitClient {
    constructor() {
        this.conn = null;
        // RabbitMQ channel
        this.channel = null;
    }
    // Connect to RabbitMQ
    async connect() {
        this.conn = await amqplib.connect(settings.rabbitUrl);
        // Create a channel
        this.channel = await this.conn.createChannel();
        // Assert the exchange with the given name and type
        await this.channel.assertExchange(settings.rabbitExchange, settings.rabbitExchangeType, {
            durable: true
        });
        // Log the connection and exchange
        console.log("[RABBIT] Connected and exchange secured:", settings.rabbitExchange);
    }

    // Publish a message to the RabbitMQ exchange
    async publish(routingKey, message) {
        // Create a buffer from the message
        const body = Buffer.from(JSON.stringify(message));
        // Publish the message to the RabbitMQ exchange
        this.channel.publish(settings.rabbitExchange, routingKey, body, {
            contentType: "application/json",
            persistent: true
        });
        // Log the published message
        console.log("[RABBIT] Message published:", message);
    }
}

module.exports = { RabbitClient };
