// src/models.js
const VEHICLE_TYPES = ["car", "truck", "bus", "motorcycle", "van"];

function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function generateRandomEvent(sensorId, location) {
    const now = new Date().toISOString();

    const lane = Math.floor(Math.random() * 4) + 1; // 1-4
    const speedKmh = parseFloat(randomFloat(10, 80).toFixed(2));
    const vehicleType = VEHICLE_TYPES[Math.floor(Math.random() * VEHICLE_TYPES.length)];
    const occupancy = parseFloat(Math.random().toFixed(3));

    return {
        sensor_id: sensorId,
        location,
        timestamp_utc: now,
        lane,
        speed_kmh: speedKmh,
        vehicle_type: vehicleType,
        occupancy,
    };
}

module.exports = { generateRandomEvent };
