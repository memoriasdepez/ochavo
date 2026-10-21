# Publicación de Ochavo — comprobación del 21 de octubre de 2026

La referencia de producto es ochavo.app 0.35.4. Android e iOS comparten sus recursos
web; las verificaciones de recursos y del proyecto iOS han pasado. Esto no acredita
una nueva compilación firmada ni un envío a las tiendas.

| Área | Comprobado | Siguiente paso |
| --- | --- | --- |
| Google Play | Ficha pública de `app.brote.inversion`, versión 0.31.4. | Preparar y subir una versión móvil con los cambios actuales. |
| App Store | Acceso API verificado con el ID de clave correcto. Ficha 0.31.4 en PREPARE_FOR_SUBMISSION, sin compilación seleccionada, sin datos de revisión y sin capturas. | Compilar/subir 0.35.4, preparar la ficha de esa versión, añadir capturas y datos de revisión y revisar los requisitos de la cuenta antes del envío. |
| AdMob Android | Adaptador, intersticiales, consentimiento UMP, exclusión de Plus y frecuencia tras cada segunda finalización guardada implementados. Configuración real desactivada. | Vincular o comprobar la ficha pública de Play en AdMob, comprobar la aprobación de la aplicación y probar consentimiento/anuncios oficiales de prueba antes de activar anuncios reales. |
| AdMob iOS | Excluido del arranque y de los plugins nativos; no hay integración activa. | Integrar SDK y adaptador iOS, crear sus identificadores propios, implementar UMP, evaluar ATT según el uso de seguimiento/IDFA, actualizar privacidad y probar en iPhone. |

`https://ochavo.app/app-ads.txt` autoriza el editor configurado de AdMob. Esto no
equivale a la aprobación de la aplicación. El último registro de consola, del 14 de
octubre, indicaba cuenta AdMob aprobada y app pendiente de revisión; ese registro
no confirma el estado de aprobación actual.

La beta iOS 0.34.1 (63) está procesada, sin caducar y en IN_BETA_TESTING para
pruebas internas según la API de Apple. La 0.31.4 (58) también está procesada. No
se ha subido la 0.35.4. El detalle de asignación a grupos y la disponibilidad de
la app devolvieron 403 con la clave Developer: no se afirman verificados.

La ficha española ya tiene descripción, palabras clave, URLs de soporte y
marketing y texto promocional. También hay nombre, subtítulo, URLs de privacidad,
categorías EDUCATION/FINANCE y una declaración de edad. No se ha validado que cada
respuesta de esa declaración sea correcta. Los pendientes de contrato/comerciante
del historial deben comprobarse por el titular en la consola.

La conexión de Apple recibe las tres variables del entorno. La clave privada
válida también se admite como cuerpo base64 PKCS#8 sin cabeceras PEM. El JWT se
firma en memoria, sin guardar claves ni tokens en Git. Se diagnosticó un ID de
clave equivocado: el correcto, deducido del nombre del P8 facilitado por el usuario
y validado contra Apple, es XVP9HS8Q34. Hasta corregir ese único campo en ajustes,
las consultas usan la sustitución por comando `APP_STORE_CONNECT_KEY_ID=XVP9HS8Q34`.
La clave privada y el emisor existentes sí funcionan con ese identificador.

El resultado de la consulta está en referencias/apple-publicacion-2026-10-21/.
No se ha abierto ni copiado al checkout el P8 adjunto al chat; bastó su nombre.
La siguiente dependencia de compilación es Codemagic: no hay credencial API suya
configurada aquí ni certificado de distribución/IPA local. Revisar el proyecto
existente y que apunte al repositorio actualizado antes de lanzar el workflow
`ios-testflight`. No se ha iniciado ni cobrado una compilación de Codemagic.

Validación realizada: seis pruebas del cliente Apple y 47 pruebas de publicidad
superadas; comprobación de igualdad de recursos Android/iOS/web y chequeo estático
de iOS superados. No se han activado anuncios reales ni enviado una nueva versión
a las tiendas durante esta comprobación.
