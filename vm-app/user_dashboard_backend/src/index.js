const express = require("express");
const http = require("http");
const { createWebSocketServer } = require("./wsServer");

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = createWebSocketServer(server);

app.post("/push", (req, res) => {
    const event = req.body;
    wss.broadcast(event);
    res.json({ ok: true });
});

server.listen(8080, () => {
    console.log("[WS] WebSocket server escuchando en puerto 8080");
});
