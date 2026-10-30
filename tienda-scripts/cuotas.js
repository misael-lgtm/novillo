// Script para la tienda (Tiendanube, plantilla Ipanema): escribe "12 cuotas sin interés de $X"
// debajo de cada precio, en los listados y en la página de producto.
// Las 12 cuotas sin interés están configuradas en Pago Nube desde $100.000, así que solo se
// muestra en los precios que llegan a ese monto. Si cambian la configuración, cambiar acá.
(function () {
  var CUOTAS = 12;
  var MINIMO = 100000;
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

    if (precio === null || precio < MINIMO) {
      if (linea) linea.remove();
      return;
    }
    var texto = CUOTAS + " cuotas sin interés de " + formatear(precio / CUOTAS);
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
