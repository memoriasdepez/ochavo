# Ochavo

Aplicación educativa de inversión para web, Android e iOS. Este repositorio privado contiene el código, la autoría de los cursos, los proyectos móviles, el servidor de compras, las pruebas y el contexto necesario para continuar el trabajo.

**Para retomar el proyecto en otro ordenador, empieza por [CONTINUAR-EN-OTRO-EQUIPO.md](CONTINUAR-EN-OTRO-EQUIPO.md).** El estado y las decisiones actuales están en [ESTADO-ACTUAL.md](ESTADO-ACTUAL.md); las instrucciones de edición, en [AGENTS.md](AGENTS.md).

## Arranque local

Necesitas Git, Git LFS, Node.js 24 y pnpm 11.19.0. Instala las dependencias sin cambiar el archivo de versiones:

```sh
git clone https://github.com/memoriasdepez/ochavo.git
cd ochavo
git lfs pull
npm exec --yes --package=pnpm@11.19.0 -- pnpm install --frozen-lockfile
```

Copia `configuracion-firebase-publica.env` a `.env.local` (no la sobrescribas si ya tienes una configuración local válida). Ese archivo contiene solo la configuración pública del cliente. Después:

```sh
npm run dev
```

La preparación de contenido se ejecuta antes de iniciar la web. Para verificar y compilar:

```sh
npm test
npm run build
```

Los tests de reglas necesitan además los emuladores locales de Firebase y Java. Las credenciales de administración, la firma de tiendas y los secretos del servidor no se incluyen. Una instalación local no publica en la web, no despliega funciones y no envía versiones a tiendas.

Para trabajar en el servidor, instala también sus dependencias desde `functions/` con `npm exec --yes --package=pnpm@11.19.0 -- pnpm install --frozen-lockfile` y ejecuta allí `npm test`. Su entorno de despliegue está fijado a Node.js 22 en `functions/package.json`; las credenciales y parámetros de producción se recuperan por los accesos privados existentes.

## Dónde se edita

- `src/`: aplicación, cuentas, sincronización, progreso, vidas, gemas, compras y analítica.
- `scripts/stocks-editorial/`, `scripts/funds-crypto-editorial/`, `scripts/technical-authoring/`: autoría de las explicaciones y ejercicios. Lee AGENTS.md antes de modificarlos; varios JSON son archivos generados.
- `android/` e `ios/`: proyectos nativos que comparten la web. `npm run android:sync` y `npm run ios:sync` regeneran sus recursos; no equivalen a una publicación en las tiendas.
- `functions/`, `firestore.rules`: servidor y permisos. Los secretos continúan en Secret Manager. La carpeta `work/payments/` conserva únicamente los módulos operativos y el plan revisados que necesitan las pruebas y las utilidades de administración.
- `tests/`, `referencias/`: comprobaciones de contenido, funcionalidades, compatibilidad y referencias históricas.

Las versiones viejas, los ZIP de entrega y los informes anteriores son material histórico. Para editar, utiliza el `main` actualizado de este repositorio.
