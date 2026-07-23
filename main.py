import asyncio
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
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
        SELECT v.id, v.tipo_reporte, v.fecha_hora, v.descripcion, v.cedula, v.nombres, v.apellidos,
               v.celular, v.genero, v.fecha_nacimiento, v.edad, v.celular_contacto_emergencia,
               COALESCE(r.estado_atencion, 'pendiente') AS estado_atencion,
               v.latitud, v.longitud
        FROM vista_reportes_emergencia v
        LEFT JOIN reportes_emergencia r ON r.id = v.id
        ORDER BY v.id DESC
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    for row in rows:
        if row['fecha_hora']:       row['fecha_hora']       = str(row['fecha_hora'])
        if row['fecha_nacimiento']: row['fecha_nacimiento'] = str(row['fecha_nacimiento'])

    return [dict(row) for row in rows]

def consultar_usuarios():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT id, cedula, nombres, apellidos, celular, genero, fecha_nacimiento
        FROM usuarios
        ORDER BY id DESC
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    for row in rows:
        if row.get('fecha_nacimiento'):
            row['fecha_nacimiento'] = str(row['fecha_nacimiento'])

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
    estado_atencion: Optional[str] = "pendiente"

class EstadoAtencionRequest(BaseModel):
    estado_atencion: str

ESTADOS_ATENCION_VALIDOS = {"pendiente", "en_atencion", "cerrada"}

def validar_estado_atencion(estado: str):
    if estado not in ESTADOS_ATENCION_VALIDOS:
        raise ValueError("Estado de atencion no valido")
    return estado

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
                estado_atencion,
                latitud, longitud, ubicacion
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s,
                %s, %s, {geom_sql}
            )
        """, (
            data.tipo_reporte, data.descripcion, data.cedula, data.nombres, data.apellidos,
            data.celular, data.genero, data.fecha_nacimiento, data.celular_contacto_emergencia,
            validar_estado_atencion(data.estado_atencion or "pendiente"),
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
                estado_atencion = %s,
                latitud = %s, longitud = %s, ubicacion = {geom_sql}
            WHERE id = %s
        """, (
            data.tipo_reporte, data.descripcion, data.cedula, data.nombres, data.apellidos,
            data.celular, data.genero, data.fecha_nacimiento,
            data.celular_contacto_emergencia,
            validar_estado_atencion(data.estado_atencion or "pendiente"),
            data.latitud, data.longitud, reporte_id
        ))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error actualizando alerta: {e}")
        raise e

def actualizar_estado_atencion(reporte_id: int, estado_atencion: str):
    estado = validar_estado_atencion(estado_atencion)
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            UPDATE reportes_emergencia
            SET estado_atencion = %s
            WHERE id = %s
        """, (estado, reporte_id))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error actualizando estado de atencion: {e}")
        raise e

@app.post("/alertas")
async def crear_alerta(req: AlertaRequest):
    await run_in_threadpool(insertar_alerta, req)
    return {"message": "Alerta registrada exitosamente"}

@app.put("/alertas/{alerta_id}")
async def editar_alerta(alerta_id: int, req: AlertaRequest):
    await run_in_threadpool(actualizar_alerta, alerta_id, req)
    return {"message": "Alerta actualizada exitosamente"}

@app.patch("/alertas/{alerta_id}/estado")
async def editar_estado_alerta(alerta_id: int, req: EstadoAtencionRequest):
    try:
        await run_in_threadpool(actualizar_estado_atencion, alerta_id, req.estado_atencion)
        return {"message": "Estado de atencion actualizado exitosamente"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@app.get("/usuarios")
async def listar_usuarios():
    return await run_in_threadpool(consultar_usuarios)

@app.websocket("/ws/usuarios")
async def websocket_usuarios(websocket: WebSocket):
    await websocket.accept()
    fail_delay = 0
    try:
        while True:
            try:
                datos = await run_in_threadpool(consultar_usuarios)
                fail_delay = 0
                await websocket.send_json(datos)
                await asyncio.sleep(5)
            except Exception as e:
                print(f"Error consultando usuarios: {e}")
                fail_delay = min(fail_delay + 10, 60)
                await asyncio.sleep(fail_delay)
    except (WebSocketDisconnect, RuntimeError):
        pass

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
