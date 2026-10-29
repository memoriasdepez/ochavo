# Continuar Ochavo en otro ordenador

## Recuperar el trabajo

1. Accede a GitHub con la cuenta que tiene permiso para el repositorio privado [memoriasdepez/ochavo](https://github.com/memoriasdepez/ochavo).
2. Instala Git con Git LFS y Node.js 24. Clona el repositorio siguiendo README.md. Si ya está clonado y no tienes cambios locales, actualízalo con `git pull --ff-only` y `git lfs pull`. Si hay cambios, consérvalos y concílialos antes de seguir.
3. Abre **esa carpeta clonada** como proyecto en Codex. No abras un ZIP antiguo ni otra copia de `brote-app`.
4. Pide: «Lee AGENTS.md y ESTADO-ACTUAL.md y continúa desde el último commit, sin publicar todavía en las tiendas».
5. Instala las dependencias fijadas, copia `configuracion-firebase-publica.env` a `.env.local` si falta y ejecuta `npm run dev`. No es necesario reproducir las carpetas ni el nombre de usuario de este ordenador.

El código y los documentos de contexto viajan con el repositorio. La conversación de Codex puede no aparecer en un ordenador distinto; ESTADO-ACTUAL.md y AGENTS.md permiten retomar las decisiones desde un chat nuevo.

## Cuentas y progreso

Las cuentas y el progreso de los usuarios están en Firebase (`brote-62d26`), no en GitHub. La configuración pública del repositorio sigue usando el mismo proyecto y la misma identidad de aplicación (`app.brote.inversion`). Inicia sesión con la misma cuenta de Ochavo para recuperar tu progreso. La configuración pública no concede acceso de administrador.

Para publicar en Firebase será necesario iniciar sesión con la cuenta que tiene permisos de ese proyecto. No vuelvas a crear la base de datos ni reinicies saldos para configurar el nuevo ordenador. No se incluye ninguna exportación de correos o de datos de usuarios.

## Lo privado se transfiere aparte

- **Android:** conserva las claves originales `app.p12` y `upload.p12`. En el ordenador original están protegidas dentro de `outputs/brote-app/.signing/`. Los archivos `.dpapi` dependen del perfil de Windows y no son una copia portable. El script `scripts/android-signing-backup.ps1` permite exportar los PKCS12 con una contraseña nueva elegida por el titular a una carpeta privada, por ejemplo en una unidad externa. Guárdalos fuera de GitHub y guarda la contraseña por separado. No ejecutes `android-signing.ps1 -Initialize` para sustituir una firma existente. La firma del APK original tiene SHA-256 `e73b8259f32e2cf8809a49b4c235e37e02234a83f8c2f2dde1825af114fa61bc`.
- **Apple/Codemagic:** utiliza la integración de firma existente y los accesos de la empresa. Los identificadores públicos y las instrucciones están en APPLE-ACCESO.md y CODEMAGIC-ACCESO.md. Los certificados, claves privadas y contraseñas no están en el repositorio.
- **Servidor y pagos:** los secretos de RevenueCat y avisos de compra continúan en Google Secret Manager. Las herramientas de administración necesitan una sesión autorizada. `functions/.env.example` muestra los nombres de configuración, con los pagos desactivados por defecto; no sustituye la configuración del servidor publicado.
- **Sesiones locales:** Firebase CLI, GitHub, Apple, Hostinger y Sender pueden pedir que inicies sesión de nuevo. GitHub no guarda esas sesiones.

Esta subida no ha exportado ni regenerado claves privadas. Conserva el ordenador original o una copia privada verificada hasta comprobar el acceso a la firma desde el nuevo equipo.

## Android e iOS

Para Android, instala JDK 21 y Android SDK Platform 36/Build Tools 36.0.0; configura `JAVA_HOME` y `ANDROID_HOME`. Puedes generar una compilación de desarrollo con `scripts/android-build.ps1` o Android Studio. Los scripts históricos de publicación y firma también buscan herramientas en la antigua carpeta `work`: en un equipo nuevo utiliza las rutas de tu instalación o adapta ese entorno, sin regenerar claves. También puedes usar Gradle con las variables privadas `VIRUTA_KEYSTORE`, `VIRUTA_STORE_PASSWORD` y `VIRUTA_KEY_ALIAS`, suministradas fuera de Git, para utilizar la firma restaurada.

Para iOS, `node scripts/ios-sync.mjs` prepara el proyecto compartido. Para compilarlo hace falta un Mac con Xcode o el flujo existente de Codemagic. Las instrucciones de traspaso están en `docs/ios/`. El usuario ha pospuesto Google Play, TestFlight y App Store: no inicies esas subidas como parte del cambio de ordenador.

## Guardar nuevos cambios

Guarda con commit y push normales a `main`; nunca fuerces una subida para sobrescribir otro ordenador. La utilidad existente `python3 scripts/cloud_sync.py --once` hace una comprobación y verifica el commit remoto; en Windows puedes usar `python` con una instalación real de Python 3.10 o posterior. NUBE.md describe su modo de vigilancia. Ese modo solo funciona mientras el proceso está abierto: el repositorio no instala un servicio permanente por sí solo.
