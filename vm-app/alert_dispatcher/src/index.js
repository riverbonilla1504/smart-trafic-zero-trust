const { connectRabbit } = require("./rabbit");
const { updateState } = require("./state");
const { getToken } = require("./auth");
const axios = require("axios");

async function main() {
    console.log("[DISPATCHER] Iniciando alert_dispatcher...");

    const token = await getToken();
    console.log("[DISPATCHER] Token obtenido");

    const { ch } = await connectRabbit("amqp://smart:smartpassword@10.0.1.139");
    await channel.assertExchange("traffic.events", "topic", { durable: true });


    await ch.assertQueue("alerts", { durable: false });
    await ch.bindQueue("alerts", "traffic.events", "sensor.*.density");

    console.log("[DISPATCHER] Esperando eventos en RabbitMQ...");

    ch.consume("alerts", async (msg) => {
        const event = JSON.parse(msg.content.toString());

        updateState(event);
        console.log("[DISPATCHER] Evento procesado:", event.sensor_id);

        // reenviar por POST al backend WebSocket
        try {
            await axios.post(
                "http://user_dashboard_backend:8080/push",
                event
            );
        } catch (e) {
            console.log("[DISPATCHER] Backend WS no disponible aún");
        }

    }, { noAck: true });
}

main();
