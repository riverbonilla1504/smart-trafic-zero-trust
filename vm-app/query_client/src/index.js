const amqp = require("amqplib");
const axios = require("axios");

async function main() {
    console.log("[QUERY] Iniciando query_client...");

    // Connect to RabbitMQ.
    const conn = await amqp.connect("amqp://smart:smartpassword@10.0.1.139");
    // Create a channel.
    const ch = await conn.createChannel();

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

main();
