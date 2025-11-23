// src/rabbitClient.js
const amqplib = require("amqplib");
const { settings } = require("./config");

class RabbitClient {
    constructor() {
        this.conn = null;
        this.channel = null;
    }

    async connect() {
        this.conn = await amqplib.connect(settings.rabbitUrl);
        this.channel = await this.conn.createChannel();
        await this.channel.assertExchange(settings.rabbitExchange, settings.rabbitExchangeType, {
            durable: true
        });
        console.log("[RABBIT] Conectado y exchange asegurado:", settings.rabbitExchange);
    }

    async publish(routingKey, message) {
        const body = Buffer.from(JSON.stringify(message));
        this.channel.publish(settings.rabbitExchange, routingKey, body, {
            contentType: "application/json",
            persistent: true
        });
    }
}

module.exports = { RabbitClient };
