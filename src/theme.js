// Paleta y tipografía. Cambiá acá para matchear la web de BAISH: Tailwind solo se usa para layout y espaciado.
export const C = {
  paper: "#F7F7F4", card: "#FFFFFF", ink: "#1B2230", muted: "#66707F", line: "#E1E3E6",
  accent: "#125D8C", accentSoft: "#E4EEF5",       // proyectos
  insight: "#7A5C1E", insightSoft: "#F5EEDC",     // insights
  up: "#3F7D4F", down: "#A8503F", warn: "#B7791F",
};
export const SERIF = "'Iowan Old Style','Palatino Linotype','Charter',Georgia,serif";
export const SANS = "-apple-system,'Inter','Segoe UI',Roboto,sans-serif";
export const FIELD = { border: `1px solid ${C.line}`, background: C.card, width: "100%", fontFamily: SERIF, fontSize: 16 };
export const BORDER = { border: `1px solid ${C.line}` };
