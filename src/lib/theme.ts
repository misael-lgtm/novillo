export const THEME_KEY = "crm_theme";

/** Se corre en <head> antes de pintar, así no parpadea al cargar. Sin elección guardada, sigue al sistema. */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;
