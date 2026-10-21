# Conectar Codemagic con este entorno

Una sesión abierta en el navegador del usuario no se comparte con el agente.
Para consultar proyectos y administrar compilaciones por la API se necesita el
token personal de Codemagic. La conexión de Apple y la de GitHub son distintas.

1. En Codemagic, abrir **Account settings → API token**.
2. Pulsar **Show** para ver el token. No revocarlo para obtener acceso.
3. En el entorno de Codex, abrir **Secretos de red → CODEMAGIC_API_TOKEN** e
   introducir el token únicamente en ese campo seguro.
4. Guardar y publicar el entorno para aplicar la conexión.

El token se declara como secreto del proxy para `api.codemagic.io`. Su valor en
el proceso puede ser un marcador: usarlo normalmente en `x-auth-token` a ese
destino mediante el proxy. No imprimirlo ni guardarlo en archivos, chat o Git.

```sh
cd /workspace/ochavo
node --use-env-proxy scripts/codemagic-status.mjs --check
node --use-env-proxy scripts/codemagic-status.mjs
node --use-env-proxy scripts/codemagic-status.mjs 6accf99e8c1d0301049c0174
```

El cliente preparado solo hace GET. No inicia compilaciones ni imprime variables
privadas que pudiera contener una respuesta del servicio. El esquema legacy no
documenta el repositorio en su respuesta de proyecto: no inferirlo del nombre.

Antes de modificar proyectos o iniciar una compilación, consultar el esquema
actual en https://codemagic.io/api/v3/schema. La documentación oficial está en
transición. Debe verificarse que el proyecto usa el código vigente de
`memoriasdepez/ochavo` y su rama/commit apropiados. La captura del usuario muestra
el proyecto antiguo `ochavo-ios`, con la última compilación #63 del 13 de octubre.
El proxy Git de este entorno rechazó leer `memoriasdepez/ochavo-ios` con 403;
no se ha sincronizado ni sobrescrito ese repositorio.

El endpoint legacy documenta POST `/apps` con `repositoryUrl` para añadir una app
y POST `/builds` con `appId`, `workflowId` y `branch` o `tag` para iniciar una
compilación. No documenta cambiar el repositorio de un proyecto ni fijar un commit
en ese disparo. No inventar parámetros para esas operaciones. La clave personal
respeta los permisos del usuario en su equipo; algunos permisos de GitHub pueden
seguir requiriendo intervención del titular.

Fuentes oficiales: https://docs.codemagic.io/rest-api/codemagic-rest-api/,
https://docs.codemagic.io/rest-api/applications/ y
https://docs.codemagic.io/rest-api/builds/.
