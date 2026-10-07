// Clave nueva (antes "crm_theme"): así todos arrancan en oscuro aunque antes hayan elegido claro.
export const THEME_KEY = "crm_tema";

/** Se corre en <head> antes de pintar, así no parpadea al cargar. Por defecto, modo oscuro (salvo que elijan claro con ☀️/🌙). */
export const themeInitScript = `try{if(localStorage.getItem("${THEME_KEY}")!=="light")document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}`;
