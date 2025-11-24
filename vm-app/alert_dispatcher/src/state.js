const trafficState = new Map();

function updateState(event) {
    trafficState.set(event.sensor_id, {
        sensor_id: event.sensor_id,
        zone_id: event.zone_id,
        congestion_level: event.congestion_level,
        last_update: new Date().toISOString()
    });
}

function getState() {
    return Array.from(trafficState.values());
}

module.exports = { updateState, getState };
