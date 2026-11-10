import { CONTROLS } from "./controls";

export const MAIN_NAV = [
  { href: "/", label: "Resumen" },
  { href: "/arquitectura", label: "Cómo funciona" },
  { href: "/maquinas", label: "Máquinas" },
  { href: "/red", label: "Red y cortafuegos" },
  { href: "/controles", label: "Controles aplicados" },
  { href: "/pruebas", label: "Pruebas y evidencias" },
];

export const CONTROL_NAV = CONTROLS.map((c) => ({ href: `/controles/${c.slug}`, label: c.title, hint: c.area }));

// Orden de las diapositivas en el modo presentacion.
export const PRESENTATION_ORDER = [
  "/",
  "/arquitectura",
  "/maquinas",
  "/red",
  "/controles",
  ...CONTROLS.map((c) => `/controles/${c.slug}`),
  "/pruebas",
];
