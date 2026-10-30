# AHRE — Pruebas aisladas de Mercado Pago

**Estado documentado:** 30 de octubre de 2026

## Objetivo

Este README describe el entorno aislado creado para probar una página web, n8n y la consulta de pagos de Mercado Pago. La prueba corre dentro del entorno AHRE y no publica sus puertos directamente en Internet.

## Estructura del servidor

El primer nivel de este esquema sigue el mapa de infraestructura compartido. Las ramas del host físico y Tailscale no se verificaron durante estas pruebas.

```text
Servidor físico — Ubuntu 22.04 (según el mapa compartido; no verificado en esta sesión)
└── Docker principal (no inspeccionado desde AHRE)
    ├── Gedecon (según el mapa; no inspeccionado)
    ├── Parky (según el mapa; no inspeccionado)
    ├── Venthora (según el mapa; no inspeccionado)
    └── AHRE (entorno interno)
        └── Ubuntu 24.04.5 — hostname ahre-server (verificado)
            ├── SSH
            ├── Docker Engine 29.8.0 — modo rootless
            ├── Docker Compose 5.5.1
            └── Docker interno de AHRE
                └── Proyecto Compose ahre-mp-pruebas
                    ├── web — Nginx Alpine
                    ├── n8n — n8nio/n8n:2.45.7
                    ├── red privada — ahre-mp-pruebas_testnet
                    └── volumen persistente — ahre-mp-pruebas_n8n_data
```

El directorio del proyecto dentro de AHRE es:

```text
/workspace/pruebas/AHRE-MP-Pruebas/
├── compose.yaml
├── nginx.conf
├── README.md
├── web/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── workflows/
    └── mercado-pago-buscar-pagos-max-2.json
```

El frontend, backend y base de datos principales de AHRE no forman parte de esta prueba. Al revisar el Docker interno antes de iniciarla no había contenedores creados. Tailscale y Funnel aparecen en el mapa general, pero su ubicación y estado no se comprobaron; el entorno de prueba no usa Funnel.

## Componentes de la prueba

| Servicio | Imagen | Puerto dentro del servidor | Función |
|---|---|---:|---|
| `web` | `nginx:alpine` | `127.0.0.1:3101` | Sirve la página de prueba y reenvía `/api/search` a n8n. |
| `n8n` | `n8nio/n8n:2.45.7` | `127.0.0.1:5678` | Ejecuta el flujo y guarda su información en el volumen `n8n_data`. |

Los dos servicios están en la red privada de Compose `testnet`. Nginx monta `web/` y `nginx.conf` desde el proyecto. El volumen de n8n mantiene sus datos cuando el contenedor se reinicia. Los puertos están ligados a `127.0.0.1`; para abrirlos desde una PC se usa un túnel SSH.

## Recorrido de una consulta

1. La página permite elegir actualmente `1` o `2` y envía ese valor en el campo `limit`.
2. Nginx recibe `POST /api/search` y lo reenvía a `/webhook/ahre-mp-search` en n8n.
3. El flujo recibe la solicitud y el nodo de código actual limita la cantidad a 1 o 2.
4. El nodo HTTP Request consulta `GET https://api.mercadopago.com/v1/payments/search` con la credencial Header Auth de n8n.
5. Un nodo de código deja campos seleccionados para mostrar en la página.
6. Respond to Webhook devuelve el JSON a la web.

La consulta es de lectura: no crea ni modifica pagos. Este endpoint busca pagos; no se debe asumir que representa todos los movimientos que aparecen en un Excel o en un reporte de cuenta.

## Cómo lo instalamos

1. Revisamos el entorno de AHRE: hostname, Ubuntu, Docker, Compose, contenedores, imágenes, volúmenes, memoria y espacio disponible. Docker estaba vacío y `hello-world` funcionó.
2. Creamos `/workspace/pruebas` en AHRE.
3. Copiamos la carpeta del proyecto desde Windows con `scp`:

```powershell
scp -r .\AHRE-MP-Pruebas ubuntu@ahre-server:/workspace/pruebas/
```

4. Iniciamos el proyecto desde SSH:

```bash
cd /workspace/pruebas/AHRE-MP-Pruebas
docker compose -p ahre-mp-pruebas up -d
docker compose -p ahre-mp-pruebas ps
```

Compose descargó las imágenes de Nginx y n8n, creó la red y el volumen, y levantó ambos contenedores.

5. Importamos el workflow JSON en n8n y configuramos una credencial Header Auth. El Access Token se guarda en n8n; no se pone en el HTML ni en el archivo exportado del workflow.
6. Al principio Nginx devolvía 403 porque no podía recorrer la carpeta `web`, que tenía permisos `700`. Se detectó con los logs y se corrigieron los permisos de lectura y acceso.
7. Al principio se intentó abrir el túnel desde la sesión SSH del servidor, donde los puertos ya estaban ocupados por Docker. El túnel debe abrirse desde PowerShell en la PC y dejarse abierto mientras se usa la web o n8n.

## Acceso desde Windows

En una ventana de PowerShell, ejecutar y dejar abierta esta conexión:

```powershell
ssh -N -L 5678:127.0.0.1:5678 -L 3101:127.0.0.1:3101 ubuntu@ahre-server
```

Luego abrir en el navegador:

- n8n: `http://localhost:5678`
- Web: `http://localhost:3101`

Se cierra el túnel con `Ctrl+C` en PowerShell.

## Estado conocido

- Los contenedores `web` y `n8n` se iniciaron correctamente y la web llegó a ejecutar el webhook de n8n.
- La aplicación AHRE mostrada en Mercado Pago Developers tiene seleccionado `Checkout API`, `API Pagos` y los permisos `read`, `offline access` y `write` activados.
- El Access Token se indicó como de producción. La credencial en n8n debe usar el header `Authorization` y el valor `Bearer ` seguido del token completo.
- La última ejecución mostrada falló en el nodo de Mercado Pago con `401 — Unauthorized use of live credentials`. La búsqueda todavía no devolvió pagos; cambiar el intervalo entre consultas no corrige ese error de autorización.
- No se guarda ningún Access Token en este README.

## Límite de resultados

La web actual ofrece solamente `1` o `2`; el workflow importado también limita la búsqueda y la salida a dos resultados. Se compartió un cambio para leer `limit` desde la web y aceptar hasta 50, pero no hay confirmación de que se haya aplicado. Para seleccionar otros valores también hay que ampliar las opciones de `web/index.html`.

## Comandos útiles

Ver contenedores del proyecto:

```bash
cd /workspace/pruebas/AHRE-MP-Pruebas
docker compose -p ahre-mp-pruebas ps
```

Ver los últimos logs:

```bash
docker compose -p ahre-mp-pruebas logs --tail=30
```

Detener los contenedores conservando el volumen y los datos de n8n:

```bash
docker compose -p ahre-mp-pruebas down
```

No agregar `-v` al comando `down` si se quiere conservar el volumen `n8n_data`.
