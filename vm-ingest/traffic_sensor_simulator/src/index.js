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

    // 1. Obtener token
    const token = await authClient.getToken();

    // 2. Conectar producer Kafka
    await producer.connect();

    // 3. Loop principal
    async function sendBatch() {
        console.log(`[APP] Enviando batch de ${settings.eventsPerBatch} eventos...`);

        for (let i = 0; i < settings.eventsPerBatch; i++) {
            const event = generateRandomEvent(settings.sensorId, settings.sensorLocation);

            const payload = {
                auth: {
                    token, // aquí va el JWT que vm-core/usará luego para validar
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
