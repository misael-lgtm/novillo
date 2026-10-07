#!/data/data/com.termux/files/usr/bin/bash
# Instalador del conector de WhatsApp de Wayfarer para Android (Termux).
# Uso, en Termux:  curl -fsSL https://wayfarer-crm.vercel.app/conector/android.sh | bash
set -e
BASE="https://wayfarer-crm.vercel.app/conector"
echo ""
echo "=== Conector de WhatsApp - Wayfarer CRM ==="
echo "Esto tarda unos minutos. No cierres Termux y dejá la pantalla prendida."
echo ""

echo "[1/5] Actualizando Termux…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null 2>&1 || pkg update -y
apt-get -y -o Dpkg::Options::="--force-confold" upgrade >/dev/null 2>&1 || true

echo "[2/5] Instalando Node.js…"
apt-get install -y nodejs-lts unzip curl >/dev/null 2>&1 || pkg install -y nodejs-lts unzip curl

echo "[3/5] Bajando el conector…"
cd ~
curl -fsSL "$BASE/wa-conector.zip" -o wa-conector.zip
if [ -f wa-conector/.env ]; then
  unzip -oq wa-conector.zip -x 'wa-conector/.env'   # actualización: se respeta la clave que ya estaba
else
  unzip -oq wa-conector.zip
fi
rm -f wa-conector.zip
cd wa-conector

echo "[4/5] Instalando lo que necesita (puede tardar)…"
npm install --omit=dev --no-audit --no-fund --loglevel=error

if ! grep -qE '^SUPABASE_SERVICE_ROLE_KEY=.+' .env; then
  echo ""
  echo "Pegá la clave service_role de Supabase (mantené apretado → Pegar) y apretá Enter:"
  read -r KEY < /dev/tty
  KEY="$(echo "$KEY" | tr -d '[:space:]')"
  sed -i "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=$KEY|" .env
fi

echo "[5/5] Dejándolo para que arranque solo…"
# Si ya estaba andando (es una actualización), cerrar el viejo para que no queden dos.
pkill -f "conector.sh" 2>/dev/null || true
pkill -f "node conector.mjs" 2>/dev/null || true
cat > ~/conector.sh <<'EOS'
#!/data/data/com.termux/files/usr/bin/bash
# Prende el conector y lo vuelve a abrir si se cae.
termux-wake-lock 2>/dev/null || true
cd ~/wa-conector
while true; do
  node conector.mjs
  echo "El conector se cerró. Se vuelve a abrir en 10 segundos…"
  sleep 10
done
EOS
chmod +x ~/conector.sh
mkdir -p ~/.termux/boot
cp ~/conector.sh ~/.termux/boot/conector.sh

echo ""
echo "✔ Listo. Ahora entrá al CRM → 📱 Teléfonos y escaneá el QR de cada local."
echo "  Si alguna vez se cierra, abrí Termux y escribí:  bash ~/conector.sh"
echo ""
exec ~/conector.sh
