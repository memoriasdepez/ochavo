# Publicación de Ochavo — 21 de octubre de 2026

Versión de producto: 0.35.5. La bienvenida automática se muestra una sola vez por cuenta, con comprobante compartido entre dispositivos. Las cuentas con progreso previo no vuelven a recibirla. Se conserva el acceso manual desde Ayuda.

| Plataforma | Comprobado | Pendiente |
| --- | --- | --- |
| ochavo.app | 0.35.5 publicada; reglas Firestore y Hosting desplegados correctamente. El dominio sirve app-GgFhN9yC.js, igual que la compilación. | Ninguno para este cambio web. |
| iOS / TestFlight | 0.35.5 (72) firmada, procesada por Apple y En pruebas en el grupo interno Ochavo — actualizaciones, con un tester. | Actualizar desde TestFlight en el iPhone. No hay envío público nuevo a App Store. |
| Android / Google Play | Fuentes 0.35.5/73 y recursos Capacitor sincronizados. La ficha pública comprobada anteriormente era 0.31.4; no se ha verificado una nueva publicación en esta operación. | Recuperar upload.p12 original para firmar y subir el AAB. No se ha subido 0.35.5. |

La clave de subida Android no apareció en la copia histórica, Documentos, Descargas, Escritorio ni en la búsqueda de Drive. Las contraseñas DPAPI y el exportado PEPK encontrado no sustituyen ese almacén. No crear otra clave ni reiniciar la firma para sortear su ausencia.

Validación: compilación web correcta, 92 pruebas de aplicación y 78 del emulador Firestore superadas. Los 1495 JSON de cursos históricos y actuales conservan sus hashes. Detalle técnico y continuidad iOS en outputs/welcome-0.35.5/ESTADO.md.

## Publicidad y App Store pública

Esta corrección no activa ni modifica AdMob. El último registro de consola, del 14 de octubre, indicaba cuenta aprobada y aplicación pendiente de revisión; no acredita la aprobación actual. Android y web conservan anuncios reales desactivados; iOS sigue sin integración AdMob activa. app-ads.txt autoriza al editor configurado, lo cual no equivale a aprobar la aplicación.

La ficha pública de App Store observada anteriormente seguía en preparación, con capturas y datos de revisión pendientes. TestFlight disponible no equivale a publicación en App Store. Contratos, declaración de comerciante y respuestas de edad deben comprobarse por el titular antes de un envío público.

Claves, tokens y certificados permanecen fuera del repositorio. Codemagic conserva su integración de firma existente; no se han sustituido identificadores ni claves.
