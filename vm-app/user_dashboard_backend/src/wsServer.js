const WebSocket = require("ws");

function createWebSocketServer(server) {
    const wss = new WebSocket.Server({ server });

    wss.broadcast = function broadcast(data) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    };

    return wss;
}

module.exports = { createWebSocketServer };
