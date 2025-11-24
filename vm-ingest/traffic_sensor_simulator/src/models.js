// src/models.js
const VEHICLE_TYPES = ["car", "truck", "bus", "motorcycle", "van"];

function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function generateRandomEvent(sensorId, location) {
    const now = new Date().toISOString();
    // Generate a random lane
    const lane = Math.floor(Math.random() * 4) + 1; // 1-4
    // Generate a random speed
    const speedKmh = parseFloat(randomFloat(10, 80).toFixed(2));
    // Generate a random vehicle type
    const vehicleType = VEHICLE_TYPES[Math.floor(Math.random() * VEHICLE_TYPES.length)];
    // Generate a random occupancy
    const occupancy = parseFloat(Math.random().toFixed(3));

    return {
        // Sensor ID
        sensor_id: sensorId,
        // Location
        location,
        // Timestamp UTC
        timestamp_utc: now,
        // Lane
        lane,
        // Speed km/h
        speed_kmh: speedKmh,
        // Vehicle type
        vehicle_type: vehicleType,
        // Occupancy
        occupancy,
    };
}

module.exports = { generateRandomEvent };
