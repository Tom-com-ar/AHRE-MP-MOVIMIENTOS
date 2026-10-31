# AHRE — Pruebas aisladas de Mercado Pago

Entorno de prueba con una web estática, n8n y Docker Compose dentro del entorno AHRE. La consulta configurada es de solo lectura: busca pagos y no los crea, modifica ni reembolsa.

## Estructura del entorno

El primer nivel sigue el mapa de infraestructura compartido. El host físico, sus otras aplicaciones y Tailscale no se verificaron durante estas pruebas.

```text
Servidor físico — Ubuntu 22.04 (según el mapa; no verificado en esta sesión)
└── Docker principal (no inspeccionado desde AHRE)
    ├── Gedecon / Parky / Venthora (según el mapa; no inspeccionados)
    └── AHRE
        └── Ubuntu 24.04.5 — hostname ahre-server (verificado)
            ├── SSH
            ├── Docker Engine 29.8.0 rootless
            ├── Docker Compose 5.5.1
            └── Docker interno de AHRE
                └── Proyecto ahre-mp-pruebas
                    ├── web — Nginx Alpine
                    ├── n8n — n8nio/n8n:2.45.7
                    ├── red privada — ahre-mp-pruebas_testnet
                    └── volumen persistente — ahre-mp-pruebas_n8n_data
```

La ruta del proyecto es `/workspace/pruebas/AHRE-MP-Pruebas/`. Incluye `compose.yaml`, `nginx.conf`, la carpeta `web/` y el workflow JSON en `workflows/`.

El frontend, backend y base de datos principales no forman parte de esta prueba. Funnel no se usa para acceder a ella. Los puertos de los contenedores están ligados a `127.0.0.1`.

## Componentes y puertos

| Servicio | Imagen | Puerto local del entorno AHRE | Función |
|---|---|---:|---|
| `web` | `nginx:alpine` | `127.0.0.1:3101` | Entrega la página y reenvía `/api/search` a n8n. |
| `n8n` | `n8nio/n8n:2.45.7` | `127.0.0.1:5678` | Ejecuta el workflow y guarda sus datos en un volumen. |

La web y n8n se comunican por la red privada de Compose `testnet`. La carpeta `web/` y `nginx.conf` se montan desde el proyecto. El volumen de n8n conserva credenciales y workflows al reiniciar el contenedor.

## Qué consulta y cuánto trae

La página permite seleccionar `1`, `5`, `10`, `25` o `50` pagos por tanda. Mercado Pago documenta un máximo de **50 registros por consulta**; el `offset` permite avanzar en los resultados hasta el límite documentado de `10000`. La referencia de búsqueda indica que devuelve pagos de los últimos 12 meses. Al pulsar «Cargar más», la web consulta la tanda siguiente y la agrega debajo de las anteriores, sin reemplazarlas.

El número total informado por `paging.total` es la cantidad de pagos que coinciden con la búsqueda; cada tanda trae como máximo el límite elegido. Esto no significa que una sola llamada devuelva todos los pagos. Una búsqueda nueva empieza desde el primer resultado y limpia la lista anterior.

Para probar la frecuencia, la web incluye una consulta automática configurable desde 30 segundos hasta 30 días. Al iniciarla, hace una consulta inmediata y muestra una cuenta regresiva hasta la próxima. Cada revisión compara los 50 pagos más recientes con los que ya están visibles y agrega arriba los que reconoce como nuevos. Este modo de prueba funciona mientras la pestaña permanezca abierta; al cerrarla, el temporizador se detiene y la lista no se guarda. Todavía no es la programación automática permanente de n8n.

La búsqueda de pagos no representa necesariamente todos los movimientos de cuenta del Excel o del reporte de Mercado Pago. Documentación: [Gestión de pagos recibidos](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/additional-content/payment-management) y [Referencia de búsqueda de pagos](https://www.mercadopago.com.ar/developers/es/reference/online-payments/subscriptions/search-payments/get).

## Normalización del movimiento

El workflow agrega `movement_type` a partir de `operation_type`:

| Valor de Mercado Pago | Etiqueta de la web |
|---|---|
| `regular_payment` | Pago |
| `pos_payment` | Pago presencial |
| `recurring_payment` | Pago recurrente |
| Otro valor conocido por la API | Otro movimiento, conservando el valor original |
| Campo vacío | Sin dato |

El medio de pago se muestra con una etiqueta en español a partir de `payment_type_id` y conserva el `payment_method_id` original. Los campos originales también se devuelven con sufijo `_raw`, para poder comparar sin perder información. Los valores nuevos o no reconocidos no se ocultan: aparecen como «Otro» junto con el valor recibido.

## Recorrido de la consulta

1. La web envía `limit` y `offset` a `POST /api/search`.
2. Nginx reenvía la petición al webhook `/webhook/ahre-mp-search` de n8n.
3. Un nodo de código valida `limit` (1–50) y `offset` (0–10000).
4. HTTP Request llama a `GET https://api.mercadopago.com/v1/payments/search` con la credencial Header Auth.
5. Un nodo normaliza tipo y medio de pago, conserva los valores originales y prepara campos seguros para la página.
6. Respond to Webhook devuelve los resultados y los datos de paginación. La web conserva los resultados ya cargados y agrega los nuevos sin duplicar IDs.

## Instalación y acceso

La carpeta se copió desde Windows al servidor con:

```powershell
scp -r .\AHRE-MP-Pruebas ubuntu@ahre-server:/workspace/pruebas/
```

Para levantar el proyecto desde SSH:

```bash
cd /workspace/pruebas/AHRE-MP-Pruebas
docker compose -p ahre-mp-pruebas up -d
docker compose -p ahre-mp-pruebas ps
```

Para abrir los puertos desde Windows, ejecutar en PowerShell y dejar abierta la sesión:

```powershell
ssh -N -L 5678:127.0.0.1:5678 -L 3101:127.0.0.1:3101 ubuntu@ahre-server
```

En el navegador:

- n8n: `http://localhost:5678`
- Web: `http://localhost:3101`

## Credencial de Mercado Pago

La credencial se guarda en n8n, no en la web ni en el JSON del workflow. La credencial Header Auth debe usar:

- **Name:** `Authorization`
- **Value:** `Bearer ` seguido del Access Token completo

No se incluye ningún token en este paquete. No lo compartas en capturas, chats ni archivos.

## Estado registrado

- Docker `hello-world` funcionó y el proyecto levantó los contenedores web y n8n.
- El primer acceso a la web dio 403 por permisos de la carpeta `web`; se corrigió el acceso de lectura y recorrido para Nginx.
- La aplicación AHRE mostrada en Developers tiene Checkout API, API Pagos y permisos `read`, `offline access` y `write` habilitados.
- La última ejecución compartida falló con `401 — Unauthorized use of live credentials`. El flujo todavía no confirmó una respuesta válida de pagos. Los cambios de paginación y normalización no corrigen ese error de credenciales.
- La web permite elegir hasta 50 pagos por tanda y agregarlos progresivamente con «Cargar más», pero el nuevo workflow debe importarse y asociarse a la credencial de n8n.

## Actualizar desde esta versión

1. Copiar la carpeta actualizada al servidor con el comando `scp` de arriba.
2. En n8n, importar `workflows/mercado-pago-buscar-pagos-paginados.json` como el nuevo workflow.
3. Abrir el nodo **Consultar pagos en Mercado Pago** y seleccionar la credencial Header Auth ya creada.
4. Desactivar el workflow anterior que usa la ruta `ahre-mp-search` antes de activar el nuevo. No dejar dos workflows activos con el mismo webhook.
5. Recargar la web y probar primero con 1 o 5 resultados. Si sigue apareciendo 401, revisar la credencial; no es un problema de paginación.

## Comandos de operación

Ver estado:

```bash
cd /workspace/pruebas/AHRE-MP-Pruebas
docker compose -p ahre-mp-pruebas ps
```

Ver últimos logs:

```bash
docker compose -p ahre-mp-pruebas logs --tail=30
```

Detener los contenedores conservando el volumen de n8n:

```bash
docker compose -p ahre-mp-pruebas down
```

No agregar `-v` al comando `down` si se quieren conservar los datos persistentes de n8n.
