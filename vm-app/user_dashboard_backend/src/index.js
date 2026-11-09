const express = require("express");
const http = require("http");
// Create a WebSocket server.
const { createWebSocketServer } = require("./wsServer");
// Create an Express server.
const app = express();
app.disable("x-powered-by");
// Use the Express server.
app.use(express.json({ limit: "16kb" }));
// Create a WebSocket server.
const server = http.createServer(app);
const wss = createWebSocketServer(server);

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

// Solo la red interna de Docker llega aquí; Nginx únicamente publica /ws.
app.post("/push", (req, res) => {
    // Get the event from the request body.
    const event = req.body;
    // Broadcast the event to all connected clients.
    wss.broadcast(event);
    // Send a response to the client.
    res.json({ ok: true });
});

server.listen(8080, () => {
    console.log("[WS] WebSocket server escuchando en puerto 8080");
});
