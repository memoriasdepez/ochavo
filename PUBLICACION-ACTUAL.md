# Publicación de Ochavo — comprobación del 21 de octubre de 2026

La referencia de producto es ochavo.app 0.35.4. Android e iOS comparten sus recursos
web; las verificaciones de recursos y del proyecto iOS han pasado. Esto no acredita
una nueva compilación firmada ni un envío a las tiendas.

| Área | Comprobado | Siguiente paso |
| --- | --- | --- |
| Google Play | Ficha pública de `app.brote.inversion`, versión 0.31.4. | Preparar y subir una versión móvil con los cambios actuales. |
| App Store | Proyecto iOS 0.35.4/66 preparado. La API sigue devolviendo 401; no se ha podido consultar la ficha privada actual. | Verificar que ID de clave, emisor y P8 pertenecen a la misma clave de equipo. Después consultar versiones, compilaciones y TestFlight. |
| AdMob Android | Adaptador, intersticiales, consentimiento UMP, exclusión de Plus y frecuencia tras cada segunda finalización guardada implementados. Configuración real desactivada. | Vincular o comprobar la ficha pública de Play en AdMob, comprobar la aprobación de la aplicación y probar consentimiento/anuncios oficiales de prueba antes de activar anuncios reales. |
| AdMob iOS | Excluido del arranque y de los plugins nativos; no hay integración activa. | Integrar SDK y adaptador iOS, crear sus identificadores propios, implementar UMP, evaluar ATT según el uso de seguimiento/IDFA, actualizar privacidad y probar en iPhone. |

`https://ochavo.app/app-ads.txt` autoriza el editor configurado de AdMob. Esto no
equivale a la aprobación de la aplicación. El último registro de consola, del 14 de
octubre, indicaba cuenta AdMob aprobada y app pendiente de revisión; ese registro
no confirma el estado de aprobación actual.

La beta iOS 0.34.1 en TestFlight y los pendientes de contrato/comerciante constan
en el historial del 14 de octubre. Se deben volver a comprobar; no se presentan
como observación actual. Algunos trámites requieren al titular en la consola.

La conexión de Apple recibe las tres variables del entorno. La clave privada
válida también se admite como cuerpo base64 PKCS#8 sin cabeceras PEM. El JWT se
firma en memoria, sin guardar claves ni tokens en Git. La autenticación remota
todavía no está verificada: Apple devuelve `401 NOT_AUTHORIZED`.

Validación realizada: seis pruebas del cliente Apple y 47 pruebas de publicidad
superadas; comprobación de igualdad de recursos Android/iOS/web y chequeo estático
de iOS superados. No se han activado anuncios reales ni enviado una nueva versión
a las tiendas durante esta comprobación.
