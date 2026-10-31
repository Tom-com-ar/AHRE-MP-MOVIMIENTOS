## Clasificación de movimientos

Los movimientos se agrupan en categorías descriptivas. El signo `+` representa una entrada de dinero y el signo `−`, una salida. Si no se puede determinar el sentido del movimiento, el importe se muestra sin signo.

| Categoría | Descripción | Sentido |
|---|---|---|
| **Pago recibido** | Pago realizado por un cliente, incluidos pagos presenciales o recurrentes. | Entrada (`+`) cuando está aprobado. |
| **Ingreso de fondos** | Dinero agregado a la cuenta, por ejemplo, mediante una transferencia al CVU. | Entrada (`+`). Esta clasificación debe confirmarse con el reporte de movimientos. |
| **Solicitud de dinero** | Pago recibido en respuesta a una solicitud de dinero. | Entrada (`+`) cuando está aprobada. |
| **Movimiento entre fondos** | Operación identificada como `partition_transfer`. Su origen, destino y sentido deben confirmarse con el reporte. | Sin signo hasta determinar si es una entrada o una salida. |
| **Transferencia saliente o retiro** | Dinero enviado desde la cuenta o retirado hacia otra cuenta. | Salida (`−`). |
| **Devolución** | Reintegro total o parcial de un pago. | Salida (`−`) para la cuenta que realiza la devolución. |
| **Contracargo, reclamo o ajuste** | Operación posterior al cobro que modifica su resultado o importe. | Depende del resultado y de los datos del movimiento. |
| **Dinero reservado** | Fondos retenidos temporalmente, por ejemplo, mientras se resuelve un reclamo. | Se identifica como reservado; no se clasifica como un pago o gasto común. |
| **Dinero liberado** | Fondos retenidos que vuelven a estar disponibles. | Se identifica como liberado y se vincula con la reserva original para evitar contarlo como un cobro nuevo. |
| **Comisión** | Cargo aplicado por Mercado Pago a una operación. | Salida (`−`) cuando aparece como movimiento. |

### Estado actual

La página consulta pagos recientes mediante `/v1/payments/search`. Actualmente muestra las categorías **Pago**, **Ingreso de fondos**, **Solicitud de dinero** y **Movimiento entre fondos**. El signo se agrega cuando se puede determinar que el importe representa una entrada.

La contraparte se muestra como **“No informado”** cuando la respuesta no incluye su nombre. El estado **“Aprobado”** indica que la operación fue aprobada; no determina por sí solo el sentido del movimiento ni confirma que los fondos estén disponibles.

### Trabajo pendiente

- Integrar los reportes de cobros, poscobros y retiros de Mercado Pago.
- Configurar en n8n la generación, consulta, descarga y lectura de los reportes.
- Confirmar el sentido de `partition_transfer` y validar las categorías con datos del reporte.
- Incorporar retiros, transferencias salientes, reservas, liberaciones, contracargos, ajustes y comisiones.
- Mostrar la contraparte cuando el reporte incluya ese dato; el nombre puede no estar disponible en todos los casos.