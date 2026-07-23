# Documentación del Proyecto SICOA (Sistema de Alertas)

Este documento contiene toda la información de contexto necesaria para que una IA entienda la arquitectura, tecnologías y estado actual del proyecto sin necesidad de analizar todos los archivos desde cero.

## 1. Arquitectura General

El proyecto consta de un **Backend en Python (FastAPI)** y dos aplicaciones de **Frontend en HTML/JS/CSS puros**.
- **Backend:** Maneja la API REST para el CRUD de alertas y una conexión WebSocket para enviar actualizaciones en tiempo real a los clientes.
- **Base de Datos:** PostgreSQL alojado en Supabase, utilizando **PostGIS** para el manejo de datos geoespaciales (coordenadas).
- **Frontend `pruebas/`:** Interfaz de administración principal. Permite ver, crear y editar alertas en un mapa interactivo.
- **Frontend `geoportal/`:** Interfaz adicional orientada al mapa (posiblemente un visor público o dashboard geoespacial).

## 2. Estructura de Directorios

```text
/
├── main.py              # Backend monolítico actual (ejecutado con uvicorn)
├── config.js            # Configuración global (API_URL, WS_URL) para los frontends
├── backend/             # Refactorización modular del backend (API REST)
│   ├── main.py          # Punto de entrada modular
│   ├── database.py      # Conexión a la DB
│   ├── models.py        # Modelos Pydantic (ej: AlertaRequest)
│   ├── crud.py          # Lógica SQL (consultas y escrituras)
│   └── routes.py        # Rutas de la API (GET, POST, PUT y WebSocket)
├── pruebas/             # Frontend administrativo (Administrador de Alertas)
│   ├── index.html       # Interfaz principal (Mapa + Lista de alertas + Formularios)
│   ├── script.js        # Lógica de la interfaz, Leaflet map, CRUD mediante fetch y WebSocket
│   └── style.css        # Estilos personalizados (CSS puro)
└── geoportal/           # Visor de mapas de alertas
    ├── index.html
    ├── script.js
    └── style.css
```

## 3. Tecnologías y Librerías

- **Backend:** Python 3, FastAPI, Uvicorn, psycopg2 (para conexión nativa a BD), Pydantic (para validación de datos en los endpoints).
- **Frontend:** Vanilla JS (sin frameworks reactivos), HTML5, CSS3.
- **Mapas:** Leaflet.js (para la visualización de mapas interactivos y marcadores).
- **Base de Datos:** PostgreSQL + PostGIS (alojada en Supabase).

## 4. Base de Datos (Esquema Principal)

El backend interactúa con la base de datos a través de dos entidades principales:
- **`vista_reportes_emergencia`**: Vista de solo lectura utilizada para obtener el listado de alertas.
- **`reportes_emergencia`**: Tabla base utilizada para insertar (POST) y actualizar (PUT) reportes.

Campos clave actualizados:
- `id` (Primary Key)
- `tipo_reporte` (Ej: Robo, Accidente, Emergencia médica)
- `fecha_hora` (Timestamp con zona horaria)
- Datos de la víctima: `cedula`, `nombres`, `apellidos`, `celular`, `genero`, `fecha_nacimiento`, `celular_contacto_emergencia`.
- `descripcion`
- `ubicacion`: Columna espacial (PostGIS) que guarda la coordenada.
- Adicionalmente, la API devuelve y recibe `latitud` y `longitud` directamente (números flotantes) para facilitar el manejo en el frontend, construyendo el `ST_MakePoint(longitud, latitud)` internamente en las inserciones/actualizaciones.

## 5. Endpoints Principales (API REST & WebSockets)

Las rutas (definidas tanto en el monolito `main.py` como en `backend/routes.py`):
- `POST /alertas`: Crea una nueva alerta.
- `PUT /alertas/{id}`: Actualiza una alerta existente (requiere el ID de la alerta en la URL).
- `WS /ws/alertas`: Endpoint WebSocket. El backend consulta la base de datos y envía un arreglo JSON con todas las alertas recurrentemente (polling simulado para mantener actualizados a los clientes en tiempo real).

## 6. Detalles Importantes de Implementación / Contexto para la IA

- **Doble estructura de Backend:** Actualmente existe un `main.py` en la raíz del proyecto, el cual se está ejecutando en el entorno local (usando `uvicorn main:app --reload`). A la par, existe un directorio `backend/` que parece ser una refactorización modular. Al realizar cambios en la lógica del servidor, **se debe confirmar en qué versión del backend se está trabajando**, o en su defecto, actualizar ambas versiones.
- **Manejo de WebSocket y Exponential Backoff:** El endpoint WebSocket consulta la base de datos periódicamente. Para evitar bloqueos por parte del "Pooler" de Supabase (error `ECIRCUITBREAKER` por demasiadas conexiones concurrentes fallidas), se implementó un mecanismo de *Exponential Backoff* que pausa progresivamente los reintentos (hasta 60s) cuando falla la conexión.
- **Integración con GeoServer:** El frontend principal de mapas (`geoportal/script.js`) carga capas geográficas externas (Límite Urbano y Vías Urbanas) directamente desde una instancia de GeoServer desplegada mediante un túnel de Cloudflare, usando `WMS` (para vías urbanas en formato tile) y `WFS` (GeoJSON con fetch para la línea de límite urbano).
- **Carga Geográfica:** El frontend consume latitud y longitud puras, y es el backend de Python quien las transforma a geometrías PostGIS (`ubicacion`) mediante instrucciones SQL (`ST_MakePoint`), eliminando la necesidad de parsear GeoJSONs manualmente en el lado del cliente (excepto al consumir WFS de GeoServer).
