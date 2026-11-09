const amqp = require("amqplib");

// Connect to RabbitMQ.
async function connectRabbit(url) {
    // Connect to RabbitMQ.
    const conn = await amqp.connect(url);
    // Si RabbitMQ se reinicia, se termina el proceso y Docker lo vuelve a arrancar.
    const exitOnLoss = (reason) => {
        console.error("[RABBIT] Conexion perdida, reiniciando el proceso:", reason?.message ?? reason);
        process.exit(1);
    };
    conn.on("close", exitOnLoss);
    conn.on("error", exitOnLoss);
    // Create a channel.
    const ch = await conn.createChannel();
    ch.on("close", exitOnLoss);
    // Return the connection and channel.
    return { conn, ch };
}

module.exports = { connectRabbit };
