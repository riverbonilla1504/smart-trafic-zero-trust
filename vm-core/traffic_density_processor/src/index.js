const { settings } = require("./config");
const { createKafkaConsumer } = require("./kafkaConsumer");
const { RabbitClient } = require("./rabbitClient");
const { validateToken } = require("./jwtValidator");

// Compute the congestion level
function computeCongestionLevel(event) {
    // Get the speed and occupancy from the event
    const speed = event.speed_kmh;
    const occupancy = event.occupancy;

    // Return the congestion level
    if (speed < 20 || occupancy > 0.8) return "HIGH";
    // Return the congestion level
    if (speed < 40 || occupancy > 0.5) return "MEDIUM";
    // Return the congestion level
    return "LOW";
}

async function main() {
    // Log the starting of the traffic density processor
    console.log("[CORE] Starting traffic_density_processor");
    // Log the configuration
    console.log("[CORE] Config:", {
        kafkaBootstrapServers: settings.kafkaBootstrapServers,
        kafkaTopicIn: settings.kafkaTopicIn,
        kafkaGroupId: settings.kafkaGroupId,
        rabbitUrl: settings.rabbitUrl,
        rabbitExchange: settings.rabbitExchange
    });

    // Create a Kafka consumer
    const consumer = createKafkaConsumer();
    // Create a RabbitMQ client
    const rabbit = new RabbitClient();
    // Connect to RabbitMQ
    // Connect to Kafka
    await rabbit.connect();

    await consumer.connect();
    // Subscribe to the Kafka topic
    await consumer.subscribe({
        topic: settings.kafkaTopicIn,
        fromBeginning: false
    });

    console.log("[CORE] Suscrito a topic:", settings.kafkaTopicIn);

    // Run the consumer
    await consumer.run({
        eachMessage: async ({ message }) => {
            try {
                // Get the raw message
                const raw = message.value.toString();
                // Parse the raw message
                const parsed = JSON.parse(raw);
                // Get the token and event from the parsed message
                const token = parsed?.auth?.token;
                const event = parsed?.event;

                // Check if the event is present
                if (!event) {
                    // Log the event is missing
                    console.warn("[CORE] Mensaje sin campo 'event', ignorando");
                    return;
                }

                // Validate the token
                let payload;
                // Try to validate the token
                try {
                    payload = validateToken(token);
                } catch (err) {
                    // Log the invalid token
                    console.warn("[CORE] Invalid token, message discarded:", err.message);
                    return;
                }

                // Compute the congestion level
                const congestionLevel = computeCongestionLevel(event);

                // Create a processed event
                const processedEvent = {
                    ...event,
                    congestion_level: congestionLevel,
                    processed_at_utc: new Date().toISOString(),
                    auth_client: payload.sub || payload.client_id || "unknown"
                };

                // Create a routing key
                const routingKey = `sensor.${event.sensor_id}.density`;
                // Publish the processed event to RabbitMQ
                await rabbit.publish(routingKey, processedEvent);
                // Log the processed event and the routing key
                console.log("[CORE] Processed event and sent to RabbitMQ:", routingKey);
            } catch (err) {
                // Log the error
                console.error("[CORE] Error processing message:", err);
            }
        }
    });
}

main()
    .then(() => {
        // Log the main function is running (consumer is running)
        console.log("[CORE] main() is running (consumer is running)");
    })
    .catch((err) => {
        console.error("[CORE] Error fatal:", err);
        process.exit(1);
    });
