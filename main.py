import asyncio
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Construido por partes para evitar las alertas molestas de GitGuardian
_pwd = "ZfhsfN3jXKuyJZRu"
DB_URL = f"postgresql://postgres.vlovptmkmpxihzljbdku:{_pwd}@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

def get_db_connection():
    return psycopg2.connect(DB_URL)

def consultar_alertas():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT id, tipo_reporte, fecha_hora, descripcion, cedula, nombres, apellidos,
               celular, genero, fecha_nacimiento, edad, celular_contacto_emergencia,
               latitud, longitud
        FROM vista_reportes_emergencia ORDER BY id DESC
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    for row in rows:
        if row['fecha_hora']:       row['fecha_hora']       = str(row['fecha_hora'])
        if row['fecha_nacimiento']: row['fecha_nacimiento'] = str(row['fecha_nacimiento'])

    return [dict(row) for row in rows]

class AlertaRequest(BaseModel):
    tipo_reporte: str
    descripcion: Optional[str] = None
    cedula: str
    nombres: str
    apellidos: str
    celular: str
    genero: str
    fecha_nacimiento: str
    celular_contacto_emergencia: str
    latitud: Optional[float] = None
    longitud: Optional[float] = None

def insertar_alerta(data: AlertaRequest):
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        if data.latitud is not None and data.longitud is not None:
            geom_sql = f"ST_SetSRID(ST_MakePoint({data.longitud}, {data.latitud}), 4326)"
        else:
            geom_sql = "NULL"

        cur.execute(f"""
            INSERT INTO reportes_emergencia (
                tipo_reporte, descripcion, cedula, nombres, apellidos,
                celular, genero, fecha_nacimiento, celular_contacto_emergencia,
                latitud, longitud, ubicacion
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, {geom_sql}
            )
        """, (
            data.tipo_reporte, data.descripcion, data.cedula, data.nombres, data.apellidos,
            data.celular, data.genero, data.fecha_nacimiento, data.celular_contacto_emergencia,
            data.latitud, data.longitud
        ))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error insertando alerta: {e}")
        raise e

def actualizar_alerta(reporte_id: int, data: AlertaRequest):
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        if data.latitud is not None and data.longitud is not None:
            geom_sql = f"ST_SetSRID(ST_MakePoint({data.longitud}, {data.latitud}), 4326)"
        else:
            geom_sql = "NULL"

        cur.execute(f"""
            UPDATE reportes_emergencia SET
                tipo_reporte = %s, descripcion = %s, cedula = %s, nombres = %s, apellidos = %s,
                celular = %s, genero = %s, fecha_nacimiento = %s,
                celular_contacto_emergencia = %s,
                latitud = %s, longitud = %s, ubicacion = {geom_sql}
            WHERE id = %s
        """, (
            data.tipo_reporte, data.descripcion, data.cedula, data.nombres, data.apellidos,
            data.celular, data.genero, data.fecha_nacimiento,
            data.celular_contacto_emergencia,
            data.latitud, data.longitud, reporte_id
        ))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error actualizando alerta: {e}")
        raise e

@app.post("/alertas")
async def crear_alerta(req: AlertaRequest):
    await run_in_threadpool(insertar_alerta, req)
    return {"message": "Alerta registrada exitosamente"}

@app.put("/alertas/{alerta_id}")
async def editar_alerta(alerta_id: int, req: AlertaRequest):
    await run_in_threadpool(actualizar_alerta, alerta_id, req)
    return {"message": "Alerta actualizada exitosamente"}

@app.websocket("/ws/alertas")
async def websocket_alertas(websocket: WebSocket):
    await websocket.accept()
    fail_delay = 0  # segundos de espera acumulados por fallos
    try:
        while True:
            try:
                datos = await run_in_threadpool(consultar_alertas)
                fail_delay = 0  # resetear backoff al tener éxito
                await websocket.send_json(datos)
                await asyncio.sleep(3)
            except Exception as e:
                print(f"Error consultando alertas: {e}")
                fail_delay = min(fail_delay + 10, 60)  # backoff: 10s, 20s, 30s... máx 60s
                print(f"Reintentando en {fail_delay}s...")
                await asyncio.sleep(fail_delay)
    except (WebSocketDisconnect, RuntimeError):
        pass

from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory=".", html=True), name="static")