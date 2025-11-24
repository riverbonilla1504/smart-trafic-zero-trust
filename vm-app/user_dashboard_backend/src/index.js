const express = require("express");
const http = require("http");
// Create a WebSocket server.
const { createWebSocketServer } = require("./wsServer");
// Create an Express server.
const app = express();
// Use the Express server.
app.use(express.json());
// Create a WebSocket server.
const server = http.createServer(app);
const wss = createWebSocketServer(server);
// Create a POST route to push events to the WebSocket server.
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
