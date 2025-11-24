const { connectRabbit } = require("./rabbit");
const { updateState } = require("./state");
const { getToken } = require("./auth");
const axios = require("axios");

async function main() {
    // Start the alert_dispatcher.
    console.log("[DISPATCHER] Iniciando alert_dispatcher...");

    // Get a token from the auth server.
    const token = await getToken();
    // Log the token.
    console.log("[DISPATCHER] Token obtenido");

    // Connect to RabbitMQ.
    const { ch } = await connectRabbit("amqp://smart:smartpassword@10.0.1.139");
    // Create the traffic.events exchange.
    await ch.assertExchange("traffic.events", "topic", { durable: true });

    // Create the alerts queue.
    await ch.assertQueue("alerts", { durable: false });
    // Bind the alerts queue to the traffic.events exchange.
    await ch.bindQueue("alerts", "traffic.events", "sensor.*.density");
    // Log the message.

    console.log("[DISPATCHER] Esperando eventos en RabbitMQ...");

    // Consume the alerts queue.
    ch.consume("alerts", async (msg) => {
        // Parse the message.
        const event = JSON.parse(msg.content.toString());

        // Update the state.
        updateState(event);
        // Log the event.
        console.log("[DISPATCHER] Evento procesado:", event.sensor_id);

        // Re-send the event to the backend WebSocket.
        try {
            await axios.post(
                "http://user_dashboard_backend:8080/push",
                event
            );
        } catch (e) {
            console.log("[DISPATCHER] Backend WS no disponible aún");
        }
        // Consume the alerts queue until the connection is closed.
    }, { noAck: true });
}

main();
