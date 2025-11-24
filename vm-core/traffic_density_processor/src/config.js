// Config file for the traffic density processor
const settings = {
    jwtSecret: process.env.AUTH_JWT_SECRET,
    // Kafka bootstrap servers
    kafkaBootstrapServers: process.env.KAFKA_BOOTSTRAP_SERVERS,
    // Kafka topic in
    kafkaTopicIn: process.env.KAFKA_TOPIC_IN || "traffic_raw_events",
    // Kafka group id
    kafkaGroupId: process.env.KAFKA_GROUP_ID || "traffic-density-processor",

    // RabbitMQ URL
    rabbitUrl: process.env.RABBITMQ_URL,
    // RabbitMQ exchange
    rabbitExchange: process.env.RABBITMQ_EXCHANGE || "traffic.events",
    // RabbitMQ exchange type
    rabbitExchangeType: process.env.RABBITMQ_EXCHANGE_TYPE || "topic"
};

module.exports = { settings };
