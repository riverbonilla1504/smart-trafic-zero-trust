const axios = require("axios");

async function getToken() {
    const res = await axios.post(
        "https://10.0.1.154/token",
        { client_id: "dispatcher", client_secret: "dispatcher123" },
        { httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }) }
    );
    return res.data.access_token;
}

module.exports = { getToken };
