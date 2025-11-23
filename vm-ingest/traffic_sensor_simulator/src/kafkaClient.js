// src/kafkaClient.js
const { Kafka } = require("kafkajs");
const { settings } = require("./config");

class KafkaTrafficProducer {
    constructor() {
        console.log(`[KAFKA] Conectando a ${settings.kafkaBootstrapServers}`);
        this.kafka = new Kafka({
            clientId: settings.kafkaClientId,
            brokers: [settings.kafkaBootstrapServers],
        });

        this.producer = this.kafka.producer();
    }

    async connect() {
        await this.producer.connect();
        console.log("[KAFKA] Producer conectado");
    }

    async send(payload) {
        await this.producer.send({
            topic: settings.kafkaTopic,
            messages: [
                {
                    value: JSON.stringify(payload),
                },
            ],
        });
    }

    async flush() {
        // kafkajs no tiene flush explícito, pero send ya espera a que se envíe.
        return;
    }
}

module.exports = { KafkaTrafficProducer };
