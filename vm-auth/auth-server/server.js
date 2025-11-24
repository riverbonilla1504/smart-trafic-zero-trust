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

// Get Token from the auth server
app.post("/token", (req, res) => {
    const { client_id, client_secret } = req.body;
    // Check if the client_id and client_secret are provided
    if (!client_id || !client_secret) {
        return res.status(400).json({ error: "client_id and client_secret required" });
    }
    // Check if the client_id is valid
    const expectedSecret = clients[client_id];
    // Check if the client_secret is valid
    if (!expectedSecret || expectedSecret !== client_secret) {
        // Return a 401 error if the client_id or client_secret is invalid
        return res.status(401).json({ error: "invalid client credentials" });
    }

    // Create a payload for the JWT
    const payload = {
        sub: client_id,
        scope: "smarttraffic",
    };

    // Sign the JWT
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
    // Return the token

    return res.json({
        access_token: token,
        // Token type
        token_type: "Bearer",
        // Token expires in
        expires_in: TOKEN_EXPIRES_IN,
    });
});
// Create an HTTPS server   
https.createServer({ key, cert }, app).listen(443, () => {
    // Log the server running on port 443 (HTTPS)
    console.log("Auth server running on port 443 (HTTPS)");
});
