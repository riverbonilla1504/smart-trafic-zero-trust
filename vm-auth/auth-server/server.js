import express from "express";
import jwt from "jsonwebtoken";
import https from "https";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2kb" }));

const SECRETS_DIR = process.env.SECRETS_DIR || "/run/app-secrets";
const readSecret = (name) => fs.readFileSync(path.join(SECRETS_DIR, name));

// jsonwebtoken lee un string sin unidades como milisegundos ("3600" = 3.6 s):
// por eso se convierte a numero, que si significa segundos.
const TOKEN_EXPIRES_IN = Number(process.env.TOKEN_EXPIRES_IN || 300);
const ISSUER = "smarttraffic-auth";
const AUDIENCE = "smarttraffic-core";

const key = readSecret("server.key");
const cert = readSecret("server.crt");
const jwtPrivateKey = readSecret("jwt-private.pem");

// Clientes autorizados: { id: { hash: "scrypt:<sal>:<hash>", scope: "..." } }.
// Los secretos nunca se guardan en claro; solo su hash con sal (clase 1).
const clients = JSON.parse(readSecret("clients.json"));

const SCRYPT_KEYLEN = 64;
// Hash de relleno para que un cliente inexistente tarde lo mismo que uno real.
const DUMMY_HASH = `scrypt:${"00".repeat(16)}:${"00".repeat(SCRYPT_KEYLEN)}`;

function verifySecret(secret, stored) {
    const [, saltHex, hashHex] = stored.split(":");
    return new Promise((resolve, reject) => {
        crypto.scrypt(secret, Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN, (err, derived) => {
            if (err) return reject(err);
            resolve(crypto.timingSafeEqual(derived, Buffer.from(hashHex, "hex")));
        });
    });
}

// Registro de auditoria en JSON: quien pidio token, desde donde y con que resultado (clase 4, AAA).
function audit(event, fields) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

// Limite por IP contra fuerza bruta (clase 10): 20 peticiones por minuto.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const hits = new Map();

function rateLimit(req, res, next) {
    const now = Date.now();
    const entry = hits.get(req.ip);
    if (!entry || now - entry.start > RATE_WINDOW_MS) {
        hits.set(req.ip, { start: now, count: 1 });
        return next();
    }
    entry.count += 1;
    if (entry.count > RATE_LIMIT) {
        audit("token_rate_limited", { ip: req.ip });
        return res.status(429).json({ error: "too many requests" });
    }
    return next();
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
        if (now - entry.start > RATE_WINDOW_MS) hits.delete(ip);
    }
}, RATE_WINDOW_MS).unref();

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

app.post("/token", rateLimit, async (req, res) => {
    const { client_id: clientId, client_secret: clientSecret } = req.body || {};

    if (typeof clientId !== "string" || typeof clientSecret !== "string") {
        return res.status(400).json({ error: "client_id and client_secret required" });
    }

    const client = Object.hasOwn(clients, clientId) ? clients[clientId] : null;

    try {
        const valid = await verifySecret(clientSecret, client ? client.hash : DUMMY_HASH);
        if (!client || !valid) {
            audit("token_denied", { client: clientId, ip: req.ip });
            return res.status(401).json({ error: "invalid client credentials" });
        }

        const token = jwt.sign({ sub: clientId, scope: client.scope }, jwtPrivateKey, {
            algorithm: "RS256",
            expiresIn: TOKEN_EXPIRES_IN,
            issuer: ISSUER,
            audience: AUDIENCE,
        });

        audit("token_issued", { client: clientId, ip: req.ip, expires_in: TOKEN_EXPIRES_IN });
        return res.json({
            access_token: token,
            token_type: "Bearer",
            expires_in: TOKEN_EXPIRES_IN,
        });
    } catch (err) {
        console.error("[AUTH] Error emitiendo token:", err.message);
        return res.status(500).json({ error: "internal error" });
    }
});

https.createServer({ key, cert, minVersion: "TLSv1.2" }, app).listen(8443, () => {
    console.log("Auth server running on port 8443 (HTTPS)");
});
