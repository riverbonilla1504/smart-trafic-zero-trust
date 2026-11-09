// src/index.js
const { settings } = require("./config");
const { AuthClient } = require("./authClient");
const { KafkaTrafficProducer } = require("./kafkaClient");
const { generateRandomEvent } = require("./models");

async function main() {
    console.log("[APP] Iniciando traffic_sensor_simulator");
    console.log(`[APP] Sensor: ${settings.sensorId} @ ${settings.sensorLocation}`);

    const authClient = new AuthClient();
    const producer = new KafkaTrafficProducer();

    // 1. Conectar producer Kafka
    await producer.connect();

    // 2. Loop principal
    async function sendBatch() {
        // AuthClient reutiliza el token y pide otro antes de que caduque.
        let token;
        try {
            token = await authClient.getToken();
        } catch (err) {
            console.error("[APP] No se pudo obtener token; batch omitido:", err.message);
            return;
        }

        console.log(`[APP] Enviando batch de ${settings.eventsPerBatch} eventos...`);

        for (let i = 0; i < settings.eventsPerBatch; i++) {
            const event = generateRandomEvent(settings.sensorId, settings.sensorLocation);

            const payload = {
                auth: {
                    token, // aquí va el JWT que vm-core valida
                },
                event,
            };

            try {
                await producer.send(payload);
                console.log("[APP] Evento enviado");
            } catch (err) {
                console.error("[APP] Error enviando a Kafka:", err.message);
            }
        }
    }

    // Enviar primero inmediatamente
    await sendBatch();

    // Luego cada X segundos
    setInterval(sendBatch, settings.sendIntervalSeconds * 1000);
}

main().catch((err) => {
    console.error("[APP] Error fatal:", err);
    process.exit(1);
});
