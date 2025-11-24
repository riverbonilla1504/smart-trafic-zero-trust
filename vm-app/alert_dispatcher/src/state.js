// Create a map to store the traffic state.
const trafficState = new Map();

// Update the traffic state.
function updateState(event) {
    // Set the traffic state.
    trafficState.set(event.sensor_id, {
        // Sensor ID
        sensor_id: event.sensor_id,
        // Zone ID
        zone_id: event.zone_id,
        // Congestion level
        congestion_level: event.congestion_level,
        // Last update
        last_update: new Date().toISOString()
    });
}
// Get the traffic state.
function getState() {
    // Return the traffic state as an array.
    return Array.from(trafficState.values());
}

module.exports = { updateState, getState };
