# OCHAVO: trabajar desde cualquier ordenador

Repositorio privado: https://github.com/memoriasdepez/ochavo
Proyecto con contexto e historiales recuperados: https://chatgpt.com/g/g-p-6ac0e3d29f18819194125344163ccf8e/project

## Archivos y ejecución

Aplicación recuperada v0.35.3, fuente brote-app. Node 24; pnpm install --frozen-lockfile, pnpm test, pnpm build. Conservar las instrucciones históricas de AGENTS.md.

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

El usuario ha pedido tomar ochavo.app como autoridad sobre la versión publicada. La captura del 21-10-2026 está en referencias/ochavo-app-2026-10-21/. comparison.json compara todos sus mundos con el código recuperado. Se han encontrado 50 mundos diferentes de 175. Esta captura conserva la referencia; no sustituye ni reconstruye los fuentes editables que falten.
