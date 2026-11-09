// Config file for the traffic density processor
const settings = {
    // Clave publica del servidor de autenticacion: core verifica tokens pero no puede emitirlos
    jwtPublicKeyFile: process.env.AUTH_JWT_PUBLIC_KEY_FILE,
    jwtIssuer: process.env.AUTH_JWT_ISSUER || "smarttraffic-auth",
    jwtAudience: process.env.AUTH_JWT_AUDIENCE || "smarttraffic-core",
    jwtRequiredScope: process.env.AUTH_JWT_REQUIRED_SCOPE || "events:publish",
    // Kafka bootstrap servers
    kafkaBootstrapServers: process.env.KAFKA_BOOTSTRAP_SERVERS,
    // Kafka topic in
    kafkaTopicIn: process.env.KAFKA_TOPIC_IN || "traffic_raw_events",
    // Kafka group id
    kafkaGroupId: process.env.KAFKA_GROUP_ID || "traffic-density-processor",
    // Certificados de TLS mutuo con Kafka
    kafkaCaFile: process.env.KAFKA_CA_FILE,
    kafkaCertFile: process.env.KAFKA_CERT_FILE,
    kafkaKeyFile: process.env.KAFKA_KEY_FILE,

    // RabbitMQ URL
    rabbitUrl: process.env.RABBITMQ_URL,
    // RabbitMQ exchange
    rabbitExchange: process.env.RABBITMQ_EXCHANGE || "traffic.events",
    // RabbitMQ exchange type
    rabbitExchangeType: process.env.RABBITMQ_EXCHANGE_TYPE || "topic"
};

module.exports = { settings };
