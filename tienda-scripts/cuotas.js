// Script para la tienda (Tiendanube, plantilla Ipanema): escribe "N cuotas sin interés de $X"
// debajo de cada precio, en los listados y en la página de producto.
// Copia la configuración de cuotas sin interés de Pago Nube: 12 cuotas sin monto mínimo.
// Si cambian la configuración, cambiar acá (ej. { cuotas: 3, minimo: 0 } debajo de un mínimo de 12).
(function () {
  // De mayor a menor: se usa la primera opción cuyo mínimo alcanza el precio.
  var OPCIONES = [
    { cuotas: 12, minimo: 0 },
  ];
  var MARCA = "wf-cuotas";

  // "$117.647,05" -> 117647.05
  function leerPrecio(texto) {
    var limpio = (texto || "").replace(/[^\d,]/g, "").replace(",", ".");
    var n = parseFloat(limpio);
    return isNaN(n) ? null : n;
  }

  function formatear(n) {
    return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function actualizar(precioEl) {
    var precio = leerPrecio(precioEl.textContent);
    var lugar = precioEl.parentElement;
    if (!lugar) return;
    var linea = lugar.nextElementSibling && lugar.nextElementSibling.classList.contains(MARCA) ? lugar.nextElementSibling : null;

    var opcion = null;
    for (var i = 0; precio && i < OPCIONES.length; i++) {
      if (precio >= OPCIONES[i].minimo) {
        opcion = OPCIONES[i];
        break;
      }
    }
    if (!opcion) {
      if (linea) linea.remove();
      return;
    }
    var texto = opcion.cuotas + " cuotas sin interés de " + formatear(precio / opcion.cuotas);
    if (!linea) {
      linea = document.createElement("div");
      linea.className = MARCA;
      linea.style.cssText = "font-size:.9em;font-weight:600;margin-top:2px;";
      lugar.insertAdjacentElement("afterend", linea);
    }
    if (linea.textContent !== texto) linea.textContent = texto;
  }

  function recorrer() {
    // js-price-display es el precio de venta en las plantillas de Tiendanube (el tachado es js-compare-price-display).
    var precios = document.querySelectorAll(".js-price-display");
    for (var i = 0; i < precios.length; i++) {
      // Ni el carrito ni el checkout: solo listados y página de producto.
      if (precios[i].closest(".js-cart-item, .js-ajax-cart-panel, .cart")) continue;
      actualizar(precios[i]);
    }
  }

  var pendiente = false;
  function programar() {
    if (pendiente) return;
    pendiente = true;
    setTimeout(function () {
      pendiente = false;
      recorrer();
    }, 150);
  }

  recorrer();
  // Cambio de talle/color, "cargar más" y filtros cambian los precios sin recargar la página.
  new MutationObserver(function (cambios) {
    for (var i = 0; i < cambios.length; i++) {
      var t = cambios[i].target;
      var el = t.nodeType === 1 ? t : t.parentElement;
      if (el && el.closest && el.closest("." + MARCA)) continue;
      programar();
      return;
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
