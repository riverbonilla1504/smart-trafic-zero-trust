const WebSocket = require("ws");

// Create a WebSocket server.
function createWebSocketServer(server) {
    // Create a WebSocket server.
    const wss = new WebSocket.Server({ server });
    // Broadcast a message to all connected clients.
    wss.broadcast = function broadcast(data) {
        // Iterate over all connected clients.
        wss.clients.forEach(client => {
            // If the client is ready, send the data to the client.
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    };
    // Return the WebSocket server.
    return wss;
}

module.exports = { createWebSocketServer };
