import express from "express";
import jwt from "jsonwebtoken";
import https from "https";
import fs from "fs";

const app = express();
app.use(express.json());

// Vars from docker-compose
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRES_IN = process.env.TOKEN_EXPIRES_IN || "300";

// Self-signed certificate created in Dockerfile
const key = fs.readFileSync("key.pem");
const cert = fs.readFileSync("cert.pem");

// Clients allowed to obtain tokens
const clients = {
    sensor: "sensor123",
    processor: "processor123",
    archiver: "archiver123",
    dashboard: "dashboard123",
    dispatcher: "dispatcher123",
    query: "query123",
};

// Get Token
app.post("/token", (req, res) => {
    const { client_id, client_secret } = req.body;

    if (!client_id || !client_secret) {
        return res.status(400).json({ error: "client_id and client_secret required" });
    }

    const expectedSecret = clients[client_id];
    if (!expectedSecret || expectedSecret !== client_secret) {
        return res.status(401).json({ error: "invalid client credentials" });
    }

    const payload = {
        sub: client_id,
        scope: "smarttraffic",
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });

    return res.json({
        access_token: token,
        token_type: "Bearer",
        expires_in: TOKEN_EXPIRES_IN,
    });
});

https.createServer({ key, cert }, app).listen(443, () => {
    console.log("Auth server running on port 443 (HTTPS)");
});
