const amqp = require("amqplib");
const axios = require("axios");

async function main() {
    console.log("[QUERY] Iniciando query_client...");

    const conn = await amqp.connect("amqp://smart:smartpassword@10.0.1.139");
    const ch = await conn.createChannel();

    await ch.assertQueue("query_traffic_queue");
    await ch.assertQueue("query_answers");

    // envío consulta cada 10s 
    setInterval(() => {
        ch.sendToQueue("query_traffic_queue", Buffer.from("status"));
        console.log("[QUERY] Consulta enviada");
    }, 10000);

    ch.consume("query_answers", (msg) => {
        console.log("[QUERY] Respuesta recibida:", msg.content.toString());
    }, { noAck: true });
}

main();
