# Documentación del Proyecto SICOA (MegaGeo Security)

Este documento contiene toda la información de contexto necesaria para entender la arquitectura, tecnologías y el estado actual del proyecto "MegaGeo Security" (anteriormente SICOA). Está pensado para que el equipo de desarrollo pueda estudiar y mantener el sistema.

## 1. Arquitectura General

El proyecto consta de un **Backend en Python (FastAPI)** y múltiples módulos de **Frontend en HTML/JS/CSS puros**, orientados a componentes.

- **Backend:** Provee una API REST para el CRUD de alertas y un servidor **WebSocket** para emitir actualizaciones de emergencias en tiempo real a los clientes conectados.
- **Base de Datos:** PostgreSQL alojado en Supabase, utilizando **PostGIS** para el manejo de datos geoespaciales.
- **Frontend Modular:** La interfaz de usuario está dividida en varias aplicaciones y componentes reutilizables (Header, Footer, Inicio, Geoportal, Pruebas).

## 2. Estructura de Directorios

```text
/
├── DOCUMENTACION.md     # Este archivo
├── main.py              # Backend monolítico actual (ejecutado con uvicorn)
├── config.js            # Configuración global (API_URL, WS_URL)
├── backend/             # Refactorización modular del backend (API REST)
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── crud.py
│   └── routes.py
├── header/              # Componente de navegación global (inyectado dinámicamente)
├── footer/              # Componente de pie de página global (inyectado dinámicamente)
├── inicio/              # Landing Page principal de "MegaGeo Security"
├── geoportal/           # Aplicación Pública: Visor de mapas en tiempo real
├── monitor-alertas/     # Centro operativo para priorizar y atender alertas
├── pruebas/             # Interfaz administrativa para gestionar (CRUD) alertas
└── multimedia/          # Assets, recursos e imágenes (ej. Carrusel de Inicio)
```

## 3. Tecnologías y Librerías

- **Backend:** Python 3, FastAPI, Uvicorn, psycopg2 (conexión BD), Pydantic (validación de modelos).
- **Frontend:** Vanilla JavaScript, HTML5, CSS3. (No se utilizan frameworks reactivos como React o Angular).
- **Mapas (GIS):** Leaflet.js para interactividad.
- **Servidor GIS:** GeoServer (para consumo de capas WMS y WFS).
- **Componentes UI:** FontAwesome (iconografía dinámica) y noUiSlider (para controles de rango avanzados, como el slider de hora).
- **Base de Datos:** PostgreSQL + PostGIS (vía Supabase).

## 4. Base de Datos (Esquema Principal)

La comunicación del backend a la base de datos se maneja principalmente mediante las siguientes entidades:
- **`vista_reportes_emergencia`**: Vista de solo lectura utilizada para obtener el listado masivo de alertas para visualización.
- **`reportes_emergencia`**: Tabla base donde se realizan las operaciones de inserción (POST) y actualización (PUT).

**Campos clave:**
- `id` (Primary Key)
- `tipo_reporte` (Robo, Accidente, Emergencia médica, etc.)
- `fecha_hora` (Timestamp)
- `cedula`, `nombres`, `apellidos`, `celular`, `genero`, `fecha_nacimiento`, `edad`
- `ubicacion`: Columna espacial (PostGIS). En la API se consumen `latitud` y `longitud` flotantes y se utiliza `ST_MakePoint` en el backend para facilitar el envío de datos desde el cliente.
- `estado_atencion`: Estado operativo de monitoreo (`pendiente`, `en_atencion`, `cerrada`). Se almacena en `reportes_emergencia` y se expone junto a la vista de alertas mediante join en el backend.

## 5. El Geoportal (Detalle de Implementación)

El `geoportal/` es el visor principal público y ha sido diseñado enfocándose fuertemente en usabilidad y estética premium:

1. **Inyección de Componentes:** Utiliza `fetch` para cargar de forma asíncrona `header/index.html` y `footer/index.html`.
2. **Distribución CSS Grid:** Layout responsivo y adaptativo de 3 columnas (Sidebar, Mapa, Logs) que evita desbordamientos o barras de desplazamiento forzadas (`overflow-x: hidden`).
3. **Filtros Dinámicos Laterales:**
   - **Tarjetas Interactivas (Pills):** Utilizadas para filtrar rápidamente por "Género" y "Tipo de Alerta". Implementadas con íconos de FontAwesome (ej. `fa-person`, `fa-car-burst`).
   - **Campos Tradicionales y Sliders:** Inputs clásicos para Fecha y Edad, y el uso de `noUiSlider` para filtrar por Rangos de Hora fluidamente.
   - Todo el filtrado se aplica de forma local en tiempo real, sin recargar peticiones a la DB.
4. **Log de Emergencias:** Tabla lateral derecha minimalista que muestra los 50 últimos reportes en tiempo real. Filas clickeables que centran el mapa en el lugar de la emergencia.
5. **Marcadores Personalizados:** Las coordenadas se pintan en el mapa Leaflet utilizando pines construidos con HTML/CSS puro (`L.divIcon`), con colores y logos asignados dinámicamente según el tipo de incidente.

## 6. Integración Externa y WebSockets

- **Tiempo Real:** Tanto `pruebas/` como `geoportal/` se suscriben al endpoint de WebSocket del backend (`WS /ws/alertas`). La tabla de registros y los pines en el mapa se repintan sin necesidad de refrescar la página de manera constante.
- **GeoServer:** El visor carga dos capas externas clave directamente de un GeoServer alojado a través de un túnel Cloudflare (`urlGeoServer`):
  1. *Límite Urbano:* Vía `WFS` (GeoJSON), el cual se extrae y se inyecta vectorialmente en el cliente.
  2. *Vías Urbanas:* Vía `WMS` (Capa de imagen en mosaico de azulejos - tile layer).
- **Exponential Backoff:** El frontend cuenta con un sistema de reconexión por WebSocket para evitar spamear al servidor si se pierde la conexión.

## 7. Monitor de Alertas

El componente `monitor-alertas/` funciona como consola operativa de alertas. Consume el mismo `WS /ws/alertas`, muestra indicadores, filtros, cola priorizada, detalle de ciudadano y mapa de ubicación.

- **Tipos reales de alerta:** emergencia médica, asalto y accidente.
- **Priorización visual:** emergencia médica se marca como crítica; asalto y accidente se marcan como prioridad alta.
- **Estado de atención:** los botones `Pendiente`, `En atención` y `Cerrada` actualizan la BD mediante `PATCH /alertas/{id}/estado`.
- **Migración requerida:** ejecutar `db/001_estado_atencion_alertas.sql` antes de desplegar el backend que consume `estado_atencion`.
