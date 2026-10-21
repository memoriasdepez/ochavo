# Consultar el estado privado de Ochavo en Apple

El proyecto ya usa la integración de Codemagic `ochavo-app-store`. El historial
registra una clave de equipo «Ochavo Codemagic» con acceso App Manager.
Reutilizarla si sigue activa y se conserva su `.p8`; no crear ni revocar claves
automáticamente. La clave guardada en Codemagic no está conectada por ello a este
entorno. Tampoco se comparte una sesión iniciada en el navegador de otro equipo.

El usuario ha confirmado que no conserva el `.p8` anterior. Para conectar este
entorno, crear una clave adicional de equipo «Ochavo Codex», empezando por el rol
Developer para consultar versiones y TestFlight. Si Apple deniega una operación
necesaria, revisar el permiso concreto antes de ampliar acceso. Descargar el `.p8`
una sola vez y conservarlo en el almacenamiento seguro del titular. No revocar
«Ochavo Codemagic» ni sustituir la integración de compilación existente.

## Abrir las consolas

- [Apps de App Store Connect](https://appstoreconnect.apple.com/apps)
- [Claves de equipo de App Store Connect](https://appstoreconnect.apple.com/access/integrations/api)
- [Proyecto existente en Codemagic](https://codemagic.io/app/6accf99e8c1d0301049c0174)

Iniciar sesión y completar la verificación de Apple en esas páginas. No enviar
contraseñas, códigos de verificación, el `.p8` ni tokens por el chat.

## Conectar este entorno

En los ajustes seguros del entorno están solicitadas estas variables:

| Variable | Contenido |
| --- | --- |
| `APP_STORE_CONNECT_KEY_ID` | Identificador de la clave de equipo. |
| `APP_STORE_CONNECT_ISSUER_ID` | Identificador del emisor que muestra Apple. |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Contenido PEM del `.p8` correspondiente, con sus líneas BEGIN/END. También se admite su cuerpo base64 PKCS#8 sin esas líneas. |

Introducir los valores únicamente en los ajustes del entorno. La clave privada
debe estar disponible para firmar en memoria: configurarla como variable de
ejecución segura, no como secreto que el proxy sustituye al enviar una petición.
No ponerla en `.env.local`, en la configuración pública de Firebase ni en Git.
Guardar los ajustes y publicar el entorno para aplicarlos según la interfaz.

El acceso de red necesita `api.appstoreconnect.apple.com`. La consola humana usa
`appstoreconnect.apple.com`. El borrador conserva los demás dominios existentes.

Comprobar la inyección sin mostrar valores:

```sh
cd /workspace/ochavo
node --use-env-proxy scripts/apple-status.mjs --check
```

Consultar las versiones de App Store, las últimas diez compilaciones y los grupos
de TestFlight:

```sh
node --use-env-proxy scripts/apple-status.mjs
```

El script solo envía GET a la API de Apple y crea un token ES256 de diez minutos
en memoria. No imprime la clave ni el token y no realiza publicaciones, cambios
de ficha ni envíos a revisión. Un grupo de TestFlight y una compilación procesada
no prueban por sí solos que esa compilación esté asignada al grupo.

Los contratos, la declaración de comerciante y otros formularios de la cuenta
necesitan la intervención del titular en App Store Connect. Una consulta de la API
no acredita que esos trámites estén resueltos.

Si no se conserva el `.p8`, Apple normalmente no permite volver a descargarlo.
Primero revisar la copia original del titular. Crear una clave adicional, si es
necesario, requiere hacerlo en Apple; no revocar la usada por Codemagic.
