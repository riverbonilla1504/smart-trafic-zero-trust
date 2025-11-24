const amqp = require("amqplib");

async function connectRabbit(url) {
    const conn = await amqp.connect(url);
    const ch = await conn.createChannel();
    return { conn, ch };
}

module.exports = { connectRabbit };
