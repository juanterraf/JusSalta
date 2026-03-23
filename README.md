# JusSalta - Seguimiento de Expedientes Judiciales

Extension de Google Chrome para consultar, monitorear y descargar expedientes judiciales del [Poder Judicial de Salta](https://plataforma.justiciasalta.gov.ar/iol-ui/p/inicio) (plataforma Iurix Online).

Herramienta gratuita para profesionales del derecho.

## Funciones

- **Busqueda de expedientes** - Por numero, caratula o partes. Acceso publico sin necesidad de login.
- **Deteccion automatica** - Si navegas un expediente en el portal IOL, la extension lo detecta y carga sus datos.
- **Detalle completo** - Encabezado, CUIJ, estado, juzgado, partes (actor, demandado, abogados).
- **Actuaciones** - Listado de actuaciones con fecha, tipo, titulo y firmantes. Descarga individual de PDFs.
- **Resumen de actuaciones** - Resumen de la ultima actuacion o informe general cronologico de toda la causa.
- **Informe con IA** - Analisis profesional del expediente usando Gemini (requiere API key gratuita de Google AI Studio).
- **Descarga completa** - Descarga todas las actuaciones como ZIP con PDFs y un informe general en texto.
- **Seguimiento de causas** - Monitoreo automatico cada 15 minutos (configurable) con notificaciones de Chrome cuando hay novedades.
- **Importacion masiva** - Carga un archivo Excel o CSV con numeros de expediente para consultar multiples causas de una vez.
- **Enviar a NotebookLM** - Crea un cuaderno en Google NotebookLM con todas las actuaciones como fuentes individuales.

## Instalacion

1. Descarga o clona este repositorio:
   ```
   git clone https://github.com/juanterraf/JusSalta.git
   ```
   O descarga el ZIP desde el boton verde **Code > Download ZIP** y descomprimilo.

2. Abri Google Chrome y navega a:
   ```
   chrome://extensions
   ```

3. Activa el **Modo de desarrollador** (esquina superior derecha).

4. Hace click en **Cargar extension sin empaquetar**.

5. Selecciona la carpeta del repositorio (la que contiene `manifest.json`).

6. La extension aparece en la barra de herramientas de Chrome.

> **Nota:** Chrome muestra un aviso de "extensiones en modo desarrollador" cada vez que abris el navegador. Es normal, hace click en "Descartar".

## Como usar

### Consultar un expediente

1. **Desde la extension:** Abri el popup y busca por numero, caratula o nombre de las partes.
2. **Desde el portal:** Navega a cualquier expediente en `plataforma.justiciasalta.gov.ar`. La extension lo detecta automaticamente.

> No se requiere login. La API publica de IOL Salta permite consultar expedientes sin autenticacion.

### Generar resumenes

Desde la pestana "Expediente":
- **Ultimo Tramite** - Datos de la actuacion mas reciente.
- **Informe General** - Cronologia completa con partes, estadisticas y estado actual.
- **Informe IA** - Analisis profesional generado por inteligencia artificial (requiere configurar API key).

### Configurar IA (opcional)

1. Obtene una API key gratuita en [Google AI Studio](https://aistudio.google.com/apikey).
2. En la extension, anda a la pestana **Info > Configuracion IA**.
3. Pega tu API key y guarda.

### Descargar expediente completo

Hace click en **Descargar todo (ZIP)** para obtener un archivo con:
- Informe general en texto
- PDFs de cada actuacion disponible

> **Importante:** No cierres el popup mientras se genera el ZIP.

### Seguimiento de causas

1. Desde cualquier expediente, hace click en **Monitorear expediente**.
2. La extension verifica automaticamente cada 15 minutos si hay actuaciones nuevas.
3. Recibis notificaciones de Chrome cuando hay novedades.
4. Configura el intervalo en la pestana **Info > Configuracion**.

### Importacion masiva

1. Prepara un archivo Excel (.xlsx) o CSV con una columna que tenga numeros de expediente.
2. En la pestana **Importar**, subi el archivo.
3. Selecciona la columna correcta y opcionalmente filtra por otra columna.
4. Hace click en **Iniciar consulta**.
5. Al terminar podes seguir todos los expedientes encontrados o exportar los resultados a Excel.

### Enviar a NotebookLM

Desde la pestana "Expediente", hace click en **Enviar a NotebookLM** para crear un cuaderno con todo el contenido del expediente.

La extension:
1. Abre NotebookLM y crea un cuaderno nuevo
2. Sube un resumen con los datos del expediente
3. Sube cada actuacion como fuente individual
4. Si tenes API key de Gemini configurada, extrae el texto de los PDFs adjuntos

**Requisitos:**
- Estar logueado en Google
- Para extraccion de PDFs: API key de Gemini configurada

**Limites:**
- Maximo 50 fuentes por cuaderno (limite de NotebookLM)
- No cerrar el popup mientras se suben las fuentes

> **Nota:** La integracion con NotebookLM usa la API interna de Google y puede dejar de funcionar si Google modifica sus endpoints.

## Estructura del proyecto

```
JusSalta/
  manifest.json              # Configuracion de la extension (MV3)
  background/
    service-worker.js         # Polling, notificaciones, proxy API
  content/
    content-script.js         # Deteccion de expedientes en el portal
    content-style.css         # Estilos del boton Monitorear y toasts
    inject-interceptor.js     # Interceptor de fetch/XHR del portal (MAIN world)
    notebooklm-bridge.js      # Bridge para la API de NotebookLM (MAIN world)
  popup/
    popup.html                # UI principal (5 pestanas)
    popup.css                 # Estilos
    popup.js                  # Logica completa
  lib/
    api.js                    # Wrapper de la API IOL Salta
    storage.js                # Helpers de chrome.storage
    diff.js                   # Deteccion de actuaciones nuevas
    jszip.min.js              # Generacion de ZIP
    xlsx.full.min.js           # Lectura/escritura de Excel
  options/
    options.html              # Pagina de configuracion
    options.js
  icons/                      # Iconos de la extension
```

## API de IOL Salta

La extension usa los endpoints publicos de Iurix Online:

| Endpoint | Descripcion |
|----------|-------------|
| `GET /iol-api/api/public/expedientes/lista?info={json}` | Buscar expedientes |
| `GET /iol-api/api/public/expedientes/encabezado?expId=X` | Datos del expediente |
| `GET /iol-api/api/public/expedientes/actuaciones?filtro={json}&page=N&size=N` | Actuaciones |
| `GET /iol-api/api/public/expedientes/actuaciones/pdf?actId=X&org=Y&expId=Z` | PDF de actuacion |
| `GET /iol-api/api/public/ui/configuracion` | Configuracion del sistema |

Todos los endpoints funcionan sin autenticacion.

## Disclaimer

- Esta es una herramienta **experimental y gratuita**.
- **No** es un producto oficial del Poder Judicial de Salta.
- El uso queda bajo la **exclusiva responsabilidad** del usuario.
- No recopila ni transmite datos personales. Toda la informacion se almacena localmente en el navegador.

## Autor

**Juan Pablo Terraf**
[derechointeligente.com.ar](https://derechointeligente.com.ar)

## Licencia

MIT
