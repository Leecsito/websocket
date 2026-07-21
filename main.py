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

DB_URL = "postgresql://postgres:dadI9bzMWNPS2zxp@db.vlovptmkmpxihzljbdku.supabase.co:5432/postgres"

def get_db_connection():
    return psycopg2.connect(DB_URL)

def consultar_alertas():
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT id, tipo_evento, fecha, hora, descripcion, cedula, nombres, apellidos, 
                   celular, genero, fecha_nacimiento, edad, contacto_emergencia,
                   ST_AsGeoJSON(geom) as geom 
            FROM alertas ORDER BY id DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        for row in rows:
            if row['fecha']: row['fecha'] = str(row['fecha'])
            if row['hora']: row['hora'] = str(row['hora'])
            if row['fecha_nacimiento']: row['fecha_nacimiento'] = str(row['fecha_nacimiento'])

        return [dict(row) for row in rows]
    except Exception as e:
        print(f"Error consultando alertas: {e}")
        return []

class AlertaRequest(BaseModel):
    tipo_evento: str
    fecha: str
    hora: str
    descripcion: Optional[str] = None
    cedula: Optional[str] = None
    nombres: Optional[str] = None
    apellidos: Optional[str] = None
    celular: Optional[str] = None
    genero: Optional[str] = None
    fecha_nacimiento: Optional[str] = None
    edad: Optional[int] = None
    contacto_emergencia: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None

def insertar_alerta(data: AlertaRequest):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        geom = None
        if data.latitud is not None and data.longitud is not None:
            geom = f"ST_SetSRID(ST_MakePoint({data.longitud}, {data.latitud}), 4326)"

        geom_sql = geom if geom else "NULL"

        cur.execute(f"""
            INSERT INTO alertas (
                tipo_evento, fecha, hora, descripcion, cedula, nombres, apellidos,
                celular, genero, fecha_nacimiento, edad, contacto_emergencia, geom
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, {geom_sql}
            )
        """, (
            data.tipo_evento, data.fecha, data.hora, data.descripcion,
            data.cedula, data.nombres, data.apellidos, data.celular,
            data.genero, data.fecha_nacimiento, data.edad, data.contacto_emergencia
        ))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error insertando alerta: {e}")
        raise e

def actualizar_alerta(id: int, data: AlertaRequest):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        geom = None
        if data.latitud is not None and data.longitud is not None:
            geom = f"ST_SetSRID(ST_MakePoint({data.longitud}, {data.latitud}), 4326)"

        geom_sql = geom if geom else "NULL"

        cur.execute(f"""
            UPDATE alertas SET
                tipo_evento = %s, fecha = %s, hora = %s, descripcion = %s, cedula = %s, nombres = %s, apellidos = %s,
                celular = %s, genero = %s, fecha_nacimiento = %s, edad = %s, contacto_emergencia = %s, geom = {geom_sql}
            WHERE id = %s
        """, (
            data.tipo_evento, data.fecha, data.hora, data.descripcion,
            data.cedula, data.nombres, data.apellidos, data.celular,
            data.genero, data.fecha_nacimiento, data.edad, data.contacto_emergencia, id
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
    try:
        while True:
            datos = await run_in_threadpool(consultar_alertas)
            await websocket.send_json(datos)
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass

from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory=".", html=True), name="static")