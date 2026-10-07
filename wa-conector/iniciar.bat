@echo off
title Conector de WhatsApp - Wayfarer CRM
cd /d "%~dp0"
where node >nul 2>nul || (echo Falta instalar Node.js: https://nodejs.org & pause & exit /b 1)
if not exist .env (echo Falta el archivo .env: copia .env.ejemplo como .env y completa las claves. & pause & exit /b 1)
if not exist node_modules (echo Instalando por unica vez... & call npm install --omit=dev --no-audit --no-fund)
:loop
node conector.mjs
echo El conector se cerro. Se vuelve a abrir en 10 segundos (cerra esta ventana para frenarlo).
timeout /t 10 >nul
goto loop
