// src/kafkaConsumer.js
const fs = require("fs");
const { Kafka } = require("kafkajs");
const { settings } = require("./config");
// Create a Kafka consumer
function createKafkaConsumer() {
    // Create a Kafka client
    const kafka = new Kafka({
        // Client ID
        clientId: "traffic-density-processor",
        // Bootstrap servers
        brokers: [settings.kafkaBootstrapServers],
        // TLS mutuo: el broker verifica este certificado y este verifica al broker
        ssl: {
            ca: [fs.readFileSync(settings.kafkaCaFile, "utf8")],
            cert: fs.readFileSync(settings.kafkaCertFile, "utf8"),
            key: fs.readFileSync(settings.kafkaKeyFile, "utf8")
        }
    });
    // Create a consumer
    return kafka.consumer({
        // Group ID
        groupId: settings.kafkaGroupId
    });
}

module.exports = { createKafkaConsumer };
