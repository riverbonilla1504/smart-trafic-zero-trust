const amqp = require("amqplib");
const axios = require("axios");

async function main() {
    console.log("[QUERY] Iniciando query_client...");

    // Connect to RabbitMQ.
    const conn = await amqp.connect(process.env.RABBITMQ_URL);
    // Si RabbitMQ se reinicia, se termina el proceso y Docker lo vuelve a arrancar.
    const exitOnLoss = (reason) => {
        console.error("[QUERY] Conexion perdida, reiniciando el proceso:", reason?.message ?? reason);
        process.exit(1);
    };
    conn.on("close", exitOnLoss);
    conn.on("error", exitOnLoss);
    // Create a channel.
    const ch = await conn.createChannel();
    ch.on("close", exitOnLoss);

    // Create the traffic.events exchange.
    await ch.assertQueue("query_traffic_queue");
    // Create the query_answers queue.
    await ch.assertQueue("query_answers");

    // Send a query every 10 seconds.
    setInterval(() => {
        ch.sendToQueue("query_traffic_queue", Buffer.from("status"));
        console.log("[QUERY] Query sent");
    }, 10000);
    // Consume the query_answers queue.
    ch.consume("query_answers", (msg) => {
        console.log("[QUERY] Respuesta recibida:", msg.content.toString());
    }, { noAck: true });
}

main().catch((err) => {
    console.error("[QUERY] Error fatal:", err.message);
    process.exit(1);
});
