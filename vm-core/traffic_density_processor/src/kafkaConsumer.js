// src/kafkaConsumer.js
const { Kafka } = require("kafkajs");
const { settings } = require("./config");
// Create a Kafka consumer
function createKafkaConsumer() {
    // Create a Kafka client
    const kafka = new Kafka({
        // Client ID
        clientId: "traffic-density-processor",
        // Bootstrap servers
        brokers: [settings.kafkaBootstrapServers]
    });
    // Create a consumer
    return kafka.consumer({
        // Group ID
        groupId: settings.kafkaGroupId
    });
}

module.exports = { createKafkaConsumer };
