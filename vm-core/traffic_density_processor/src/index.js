const { settings } = require("./config");
const { createKafkaConsumer } = require("./kafkaConsumer");
const { RabbitClient } = require("./rabbitClient");
const { validateToken } = require("./jwtValidator");

function computeCongestionLevel(event) {
    const speed = event.speed_kmh;
    const occupancy = event.occupancy;

    if (speed < 20 || occupancy > 0.8) return "HIGH";
    if (speed < 40 || occupancy > 0.5) return "MEDIUM";
    return "LOW";
}

async function main() {
    console.log("[CORE] Iniciando traffic_density_processor");
    console.log("[CORE] Config:", {
        kafkaBootstrapServers: settings.kafkaBootstrapServers,
        kafkaTopicIn: settings.kafkaTopicIn,
        kafkaGroupId: settings.kafkaGroupId,
        rabbitUrl: settings.rabbitUrl,
        rabbitExchange: settings.rabbitExchange
    });

    const consumer = createKafkaConsumer();
    const rabbit = new RabbitClient();

    await rabbit.connect();
    await consumer.connect();

    await consumer.subscribe({
        topic: settings.kafkaTopicIn,
        fromBeginning: false
    });

    console.log("[CORE] Suscrito a topic:", settings.kafkaTopicIn);

    await consumer.run({
        eachMessage: async ({ message }) => {
            try {
                const raw = message.value.toString();
                const parsed = JSON.parse(raw);

                const token = parsed?.auth?.token;
                const event = parsed?.event;

                if (!event) {
                    console.warn("[CORE] Mensaje sin campo 'event', ignorando");
                    return;
                }

                let payload;
                try {
                    payload = validateToken(token);
                } catch (err) {
                    console.warn("[CORE] Token inválido, mensaje descartado:", err.message);
                    return;
                }

                const congestionLevel = computeCongestionLevel(event);

                const processedEvent = {
                    ...event,
                    congestion_level: congestionLevel,
                    processed_at_utc: new Date().toISOString(),
                    auth_client: payload.sub || payload.client_id || "unknown"
                };

                const routingKey = `sensor.${event.sensor_id}.density`;

                await rabbit.publish(routingKey, processedEvent);
                console.log("[CORE] Evento procesado y enviado a RabbitMQ:", routingKey);
            } catch (err) {
                console.error("[CORE] Error procesando mensaje:", err);
            }
        }
    });
}

main()
    .then(() => {
        console.log("[CORE] main() se está ejecutando (consumer en marcha)");
    })
    .catch((err) => {
        console.error("[CORE] Error fatal:", err);
        process.exit(1);
    });
