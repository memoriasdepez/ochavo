# Ochavo 0.35.5 — bienvenida una sola vez

Cambio solicitado el 21 de octubre de 2026: publicar la corrección en ochavo.app, actualizar Android en Google Play y subir iOS a TestFlight.

La bienvenida pasa a un comprobante privado de la cuenta, compartido entre dispositivos e independiente del progreso. Una transacción impide que dos dispositivos la reclamen a la vez. Las cuentas con progreso existente no vuelven a recibir el tutorial. Ayuda conserva la opción manual. Sin confirmación del servidor no se interpreta la cuenta como nueva. Borrado y cambio de cuenta invalidan los callbacks pendientes.

Validación local: 20 pruebas de bienvenida y controlador de interfaz superadas. Sintaxis de main.js y cloud.js validada. Las reglas tienen dos regresiones nuevas; falta ejecutarlas con el emulador. Publicar las reglas antes de Hosting. Versiones de proyecto: Android 0.35.5/73; iOS 0.35.5/67 (Codemagic asigna un número de compilación superior al compilar).

Pendiente de confirmar: compilación completa, despliegue web, firma Android y subidas a tiendas. La conexión GitHub permite leer/escribir memoriasdepez/ochavo; la descarga Git directa está bloqueada por red. La copia de trabajo se reconstruyó comprobando los hashes Git de cada archivo recuperado, y los binarios LFS se verificaron mediante SHA-256. Codemagic está autenticado pero solo tiene autorizados ochavo-ios y melilla-play-ios; la conexión actual de GitHub no permite leer ochavo-ios. La copia histórica local conserva las contraseñas Android cifradas con DPAPI, pero no los almacenes app.p12/upload.p12. No regenerar ni sustituir claves para sortear esa ausencia.
