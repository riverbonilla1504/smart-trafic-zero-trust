// src/config.js
require("dotenv").config?.(); // no hace nada si no hay .env (por si luego lo usas)

const settings = {
    authUrl: process.env.AUTH_URL, // URL del servidor de autenticación
    authClientId: process.env.AUTH_CLIENT_ID,
    authClientSecret: process.env.AUTH_CLIENT_SECRET,
    authTlsVerify: (process.env.AUTH_TLS_VERIFY || "false").toLowerCase() === "true",

    kafkaBootstrapServers: process.env.KAFKA_BOOTSTRAP_SERVERS, // Servidores de Kafka
    kafkaTopic: process.env.KAFKA_TOPIC, // Tema de Kafka donde se envían los eventos
    kafkaClientId: process.env.KAFKA_CLIENT_ID || "traffic-sensor-simulator", // Client ID para Kafka

    sensorId: process.env.SENSOR_ID || "sensor-1",
    sensorLocation: process.env.SENSOR_LOCATION || "Unknown",
    sendIntervalSeconds: parseInt(process.env.SEND_INTERVAL_SECONDS || "2", 10),
    eventsPerBatch: parseInt(process.env.EVENTS_PER_BATCH || "5", 10),
};

module.exports = { settings };
