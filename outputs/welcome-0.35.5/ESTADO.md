# Ochavo 0.35.5 — bienvenida una sola vez

Cambio solicitado el 21 de octubre de 2026: publicar la corrección en ochavo.app, actualizar Android en Google Play y subir iOS a TestFlight.

La bienvenida pasa a un comprobante privado de la cuenta, compartido entre dispositivos e independiente del progreso. Una transacción impide que dos dispositivos la reclamen a la vez. Las cuentas con progreso existente no vuelven a recibir el tutorial. Ayuda conserva la opción manual. Sin confirmación del servidor no se interpreta la cuenta como nueva. Borrado y cambio de cuenta invalidan los callbacks pendientes.

Validación completada en Cloud Shell: compilación web correcta, 92 pruebas de aplicación y 78 pruebas con el emulador Firestore superadas, incluidas las dos nuevas regresiones del comprobante. Los 1495 JSON de cursos históricos y actuales conservan exactamente los hashes Git anteriores; digest agregado f69a1d02fdbbb40b3602c03f627e0f6a7d17bedc36f969ee8c14bcee4a318ae2.

Web: Firebase confirmó release complete y Deploy complete para reglas Firestore y Hosting. ochavo.app/?verify=0355 sirve app-GgFhN9yC.js, igual que dist/index.html. La primera subida agotó reintentos de red; la siguiente terminó con FIREBASE_HOSTING_UPLOAD_CONCURRENCY=10.

iOS: Codemagic compiló, firmó y envió 0.35.5 (72). Apple la muestra En pruebas en el grupo interno Ochavo — actualizaciones, con un tester. No se ha enviado una versión pública a revisión de App Store.

Android: proyecto 0.35.5/73 y cap sync android completado con los recursos actuales. No se ha firmado ni subido a Google Play: falta upload.p12 original. La búsqueda en Documentos, Descargas, Escritorio, la copia histórica y Drive no lo encontró. Las contraseñas DPAPI y el exportado PEPK no sustituyen el almacén privado de subida. No regenerar ni sustituir claves para sortear esa ausencia.

La conexión GitHub permite leer/escribir memoriasdepez/ochavo; la descarga Git directa está bloqueada por red. La copia se reconstruyó comprobando los hashes Git y verificando los binarios LFS mediante SHA-256. Cambio principal 114ebdd3db250601258cc964625fd603ec4fcd63; ubicación corregida de pruebas Firestore 55d1b31e38c5c98206bbb270a71013a5c9feaf4e.

Codemagic conserva el proyecto y firma existentes. Solo están autorizados ochavo-ios y melilla-play-ios; se depositó una instantánea verificada de los fuentes actuales en memoriasdepez/ochavo-ios, commit b621f21026bca46de02e4792d9c6459fd564a45a, sin ampliar accesos. El workflow valida el SHA-256 de la instantánea y ejecuta las 20 pruebas de bienvenida/interfaz antes de compilar. Build: https://codemagic.io/app/6accf99e8c1d0301049c0174/build/6ad82398454d2506f7abaa17

Antes de futuras compilaciones iOS, renovar esa instantánea desde main; memoriasdepez/ochavo sigue siendo la fuente de trabajo. No incluir credenciales ni certificados en Git.
