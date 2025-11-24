const amqp = require("amqplib");

// Connect to RabbitMQ.
async function connectRabbit(url) {
    // Connect to RabbitMQ.
    const conn = await amqp.connect(url);
    // Create a channel.
    const ch = await conn.createChannel();
    // Return the connection and channel.
    return { conn, ch };
}

module.exports = { connectRabbit };
