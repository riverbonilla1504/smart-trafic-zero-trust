import { CLASSES } from "./classes";

export const MAIN_NAV = [
  { href: "/", label: "Resumen" },
  { href: "/arquitectura", label: "Cómo funciona" },
  { href: "/maquinas", label: "Máquinas" },
  { href: "/red", label: "Red y cortafuegos" },
  { href: "/clases", label: "Clases aplicadas" },
  { href: "/pruebas", label: "Pruebas y evidencias" },
];

export const CLASS_NAV = CLASSES.map((c) => ({ href: `/clases/${c.slug}`, label: c.title, hint: c.label }));

// Orden de las diapositivas en el modo presentacion.
export const PRESENTATION_ORDER = [
  "/",
  "/arquitectura",
  "/maquinas",
  "/red",
  "/clases",
  ...CLASSES.map((c) => `/clases/${c.slug}`),
  "/pruebas",
];
