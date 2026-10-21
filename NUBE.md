# OCHAVO: trabajar desde cualquier ordenador

Repositorio privado: https://github.com/memoriasdepez/ochavo
Proyecto con contexto e historiales recuperados: https://chatgpt.com/g/g-p-6ac0e3d29f18819194125344163ccf8e/project

## Archivos y ejecución

Aplicación 0.35.5 con bienvenida una sola vez por cuenta; véase PUBLICACION-ACTUAL.md para el estado verificado de cada plataforma. Node 24; pnpm install --frozen-lockfile, pnpm test, pnpm build. En un checkout nuevo, copiar configuracion-firebase-publica.env a .env.local si no existe; contiene únicamente la configuración pública del navegador. Conservar las instrucciones históricas de AGENTS.md.

Esta migración procede de las copias recuperadas de Drive; no incluye contraseñas, certificados de firma ni dependencias regenerables. Los originales se conservan en el proyecto de ChatGPT como recuperación histórica.

## Guardado

El entorno de Codex Cloud debe tener este repositorio conectado y su inicio configurado para arrancar `python3 scripts/cloud_sync.py --watch`. El script espera 30 segundos sin cambios y guarda mediante commit y push normal a main. No hace despliegues.

La última comprobación está en `.cloud-sync/status.json`: `synced` incluye el commit verificado en GitHub; `blocked` requiere resolver el acceso o la divergencia. El script por sí solo no crea un entorno de Cloud ni inicia un servicio permanente.

Para guardar inmediatamente: `python3 scripts/cloud_sync.py --once`. Para usarlo en Windows puede usarse `python` en vez de `python3`. Requiere Git, Git LFS, Python 3.10+ y acceso autorizado al repositorio privado.

En un ordenador nuevo, entra con la misma cuenta en ChatGPT, elige Trabajar en > Nube y este entorno, y continúa el mismo chat. Para un chat nuevo, partir del main actualizado. Usa un solo chat de edición a la vez por proyecto; los cambios simultáneos se conservan, pero pueden necesitar conciliación.

Fuera de Cloud, un checkout local solo se guarda automáticamente mientras el proceso está activo y tiene acceso a Internet. Las fuentes ZIP de ChatGPT no se actualizan con los cambios del repositorio.

## Contexto anterior

Leer CONTEXTO-RECUPERADO.txt para retomar las decisiones y el trabajo de las conversaciones recuperadas. Es un archivo histórico; las instrucciones actuales están en AGENTS.md y en el chat activo.

## Referencia publicada de OCHAVO

El usuario ha pedido tomar ochavo.app como autoridad y sustituir la copia recuperada por esa versión. La captura del 21-10-2026 está en referencias/ochavo-app-2026-10-21/. comparison.json conserva la auditoría inicial, que encontró 50 mundos diferentes. Los textos publicados de las 500 lecciones de ETFs y Cripto están recuperados como autoría editable en scripts/funds-crypto-editorial/published-prose.json; refine.mjs los aplica como etapa final, conservando ejercicios, exámenes, IDs y revisiones compatibles. pnpm build reconstruye la versión 0.35.4: HTML, seis assets principales y los 175 mundos idénticos a la publicación. tests/published-reference.test.js protege esa referencia. alignment.json recoge la comprobación final.

Android e iOS usan los mismos recursos web reconstruidos. Los proyectos quedan preparados como 0.35.4/72 y 0.35.4/66 respectivamente; esto no acredita publicación en tiendas ni compilación o firma nativa. No desplegar ni sustituir una versión de tienda como parte de esta recuperación.

