// src/kafkaClient.js
const { Kafka } = require("kafkajs");
const { settings } = require("./config");

class KafkaTrafficProducer {
    constructor() {
        // Log the connection to the Kafka servers
        console.log(`[KAFKA] Conectando a ${settings.kafkaBootstrapServers}`);
        // Create a Kafka client
        this.kafka = new Kafka({
            // Client ID
            clientId: settings.kafkaClientId,
            // Bootstrap servers
            brokers: [settings.kafkaBootstrapServers],
        });

        // Create a producer
        this.producer = this.kafka.producer();
    }
    // Connect to the Kafka servers
    async connect() {
        await this.producer.connect();
        // Log the connection to the Kafka servers
        console.log("[KAFKA] Producer connected");
    }

    async send(payload) {
        // Send the payload to the Kafka topic
        await this.producer.send({
            topic: settings.kafkaTopic,
            messages: [
                // Message
                {
                    // Value
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
