// src/kafkaConsumer.js
const { Kafka } = require("kafkajs");
const { settings } = require("./config");

function createKafkaConsumer() {
    const kafka = new Kafka({
        clientId: "traffic-density-processor",
        brokers: [settings.kafkaBootstrapServers]
    });

    return kafka.consumer({
        groupId: settings.kafkaGroupId
    });
}

module.exports = { createKafkaConsumer };
