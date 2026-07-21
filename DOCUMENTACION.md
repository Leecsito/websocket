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

La tabla principal es `alertas`. Campos clave:
- `id` (Serial / Primary Key)
- `tipo_evento` (Ej: Robo, Emergencia médica)
- `fecha`, `hora`
- Datos de la víctima: `cedula`, `nombres`, `apellidos`, `celular`, `genero`, `fecha_nacimiento`, `edad`, `contacto_emergencia`.
- `descripcion`
- `geom`: Columna espacial que guarda un Point (Longitud, Latitud) con SRID 4326.
  - Al insertar/actualizar se usa la instrucción SQL: `ST_SetSRID(ST_MakePoint(long, lat), 4326)`
  - Al consultar se extrae como JSON para consumirlo en el frontend: `ST_AsGeoJSON(geom)`

## 5. Endpoints Principales (API REST & WebSockets)

Las rutas (definidas tanto en el monolito `main.py` como en `backend/routes.py`):
- `POST /alertas`: Crea una nueva alerta.
- `PUT /alertas/{id}`: Actualiza una alerta existente (requiere el ID de la alerta en la URL).
- `WS /ws/alertas`: Endpoint WebSocket. El backend consulta la base de datos y envía un arreglo JSON con todas las alertas recurrentemente (polling simulado para mantener actualizados a los clientes en tiempo real).

## 6. Detalles Importantes de Implementación / Contexto para la IA

- **Doble estructura de Backend:** Actualmente existe un `main.py` en la raíz del proyecto, el cual se está ejecutando en el entorno local (usando `uvicorn main:app --reload`). A la par, existe un directorio `backend/` que parece ser una refactorización modular. Al realizar cambios en la lógica del servidor, **se debe confirmar en qué versión del backend se está trabajando**, o en su defecto, actualizar ambas versiones.
- **Manejo de WebSocket en Frontend:** En el frontend (por ejemplo `pruebas/script.js`), el cliente abre una conexión WebSocket (`ws://.../ws/alertas`) y mediante el evento `onmessage` actualiza reactivamente la lista lateral de tarjetas y los marcadores del mapa con los datos recibidos desde el servidor.
- **Carga Geográfica:** El frontend interactúa únicamente con coordenadas puras (latitud y longitud), y es el backend de Python quien se encarga de transformarlas hacia y desde geometrías de PostGIS usando las funciones espaciales puras de SQL (sin ORM complejos como SQLAlchemy+GeoAlchemy, solo `psycopg2` puro).
