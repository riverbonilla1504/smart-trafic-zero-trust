// src/config.js
const settings = {
    jwtSecret: process.env.AUTH_JWT_SECRET,

    kafkaBootstrapServers: process.env.KAFKA_BOOTSTRAP_SERVERS,
    kafkaTopicIn: process.env.KAFKA_TOPIC_IN || "traffic_raw_events",
    kafkaGroupId: process.env.KAFKA_GROUP_ID || "traffic-density-processor",

    rabbitUrl: process.env.RABBITMQ_URL,
    rabbitExchange: process.env.RABBITMQ_EXCHANGE || "traffic.events",
    rabbitExchangeType: process.env.RABBITMQ_EXCHANGE_TYPE || "topic"
};

module.exports = { settings };
