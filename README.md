# Agenda AMUC - V6

## Cambio principal: disponibilidad de horarios

La verificación visual y el guardado ahora usan la misma función de Supabase.

Reglas:
- Superposición de horarios: BLOQUEADA siempre.
- Separación menor a 3 horas sin superposición: muestra:
  "Tiempo entre reservas menor a tres horas. ¿Desea agendar el turno de igual manera?"
  y permite continuar si el operador confirma.
- Separación de 3 horas o más: horario disponible.

## Instalación

1. Ejecutar `actualizacion_supabase_v6.sql` en Supabase > SQL Editor.
2. Reemplazar los archivos del repositorio por los incluidos en este ZIP.
3. Conservar aplicado el SQL de V5, porque su trigger es la protección final contra superposiciones simultáneas.

También se mantiene el último ajuste visual de la ficha del cliente.


## V7 - Seña 50%
- La seña pasa a ser del 50% del valor total del alquiler.
- El importe se calcula automáticamente al seleccionar Seña.
- El pago total descuenta la seña y cualquier pago previo, cobrando solo el saldo restante.
- No requiere cambios nuevos en Supabase respecto de la V6.


## V8 - Documentación automática al reservar

Al guardar una reserva:
- Se genera automáticamente `Salon_fiestas_ficha` con:
  - fecha del evento,
  - horario de inicio y fin,
  - cantidad de horas,
  - motivo,
  - apellido y nombre del responsable,
  - DNI,
  - teléfono,
  - correo electrónico,
  - fecha/hora de ingreso,
  - fecha/hora de egreso.
- Si el evento termina al día siguiente, la fecha de egreso se calcula automáticamente.
- El Reglamento de Uso se entrega sin modificaciones.
- En celulares compatibles, el botón "Compartir archivos" adjunta ambos PDF al menú nativo de compartir, donde puede elegirse WhatsApp, correo, etc.
- En navegadores sin soporte para compartir archivos, se pueden descargar ambos PDF y se ofrecen accesos a WhatsApp/correo para preparar el mensaje.

No requiere cambios nuevos en Supabase.


## V9 - Correcciones

1. Reservas:
   - Se corrigió el botón Eliminar.
   - Solo funciona para perfiles ADMINISTRADOR.
   - Solicita confirmación antes de borrar.
   - Los pagos asociados se eliminan por la relación ON DELETE CASCADE ya existente.

2. Ficha del salón:
   - Los datos completados automáticamente se imprimen 1 punto más grandes.

3. Ingreso y egreso:
   - Ingreso = 30 minutos antes del comienzo contratado.
   - Egreso = 30 minutos después del final contratado.
   - El cálculo ajusta automáticamente la fecha si se cruza la medianoche.
   - Ejemplo: alquiler 21:00 a 05:00 -> ingreso 20:30 / egreso 05:30 del día siguiente.

No requiere un SQL nuevo si ya se ejecutó `actualizacion_supabase_v4.sql`.


## V10 - Corrección botón eliminar reservas

- Se eliminó el `onclick` embebido del botón de papelera.
- Cada botón se vincula ahora mediante `addEventListener` después de renderizar la tabla.
- Se agrega confirmación, estado visual durante el borrado y aviso de éxito/error.
- Sigue restringido exclusivamente al rol ADMINISTRADOR.

No requiere SQL nuevo si ya se ejecutó la política de borrado de V4.


## V11 - Solicitudes WhatsApp
- Nueva pestaña Solicitudes WhatsApp.
- Estados: Pendiente, En revisión, Convertida y Descartada.
- Acciones: Tomar, Ver conversación, Crear reserva y Descartar.
- Crear reserva lleva los datos disponibles a la pantalla de Reservas.
- Dashboard muestra cantidad de solicitudes pendientes.
- Usa las tablas WhatsApp ya creadas en Supabase. No requiere SQL nuevo.
