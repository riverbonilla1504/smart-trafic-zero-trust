"use strict";

const MAX_ROWS = 50;
const statusEl = document.getElementById("status");
const rowsEl = document.getElementById("events");
const LEVELS = new Set(["LOW", "MEDIUM", "HIGH"]);

function cell(text) {
  const td = document.createElement("td");
  // textContent evita que un dato del evento se interprete como HTML (XSS).
  td.textContent = text;
  return td;
}

function addEvent(event) {
  const row = document.createElement("tr");
  const level = String(event.congestion_level);
  const levelCell = cell(level);
  if (LEVELS.has(level)) {
    levelCell.className = `level level-${level.toLowerCase()}`;
  }

  row.append(
    cell(new Date(event.processed_at_utc || Date.now()).toLocaleTimeString()),
    cell(event.sensor_id ?? "-"),
    cell(event.speed_kmh != null ? `${Number(event.speed_kmh).toFixed(1)} km/h` : "-"),
    cell(event.occupancy != null ? `${Math.round(Number(event.occupancy) * 100)} %` : "-"),
    levelCell
  );

  rowsEl.prepend(row);
  while (rowsEl.children.length > MAX_ROWS) {
    rowsEl.lastElementChild.remove();
  }
}

function connect() {
  const socket = new WebSocket(`wss://${location.host}/ws`);

  socket.addEventListener("open", () => {
    statusEl.textContent = "Conectado";
    statusEl.classList.add("online");
  });

  socket.addEventListener("message", (message) => {
    try {
      addEvent(JSON.parse(message.data));
    } catch (err) {
      console.warn("Evento no válido", err);
    }
  });

  socket.addEventListener("close", () => {
    statusEl.textContent = "Sin conexión. Reintentando...";
    statusEl.classList.remove("online");
    setTimeout(connect, 3000);
  });
}

connect();
