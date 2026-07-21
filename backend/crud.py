# Lógica de acceso a datos (queries y escrituras)
from psycopg2.extras import RealDictCursor
from backend.database import get_connection
from backend.models import AlertaRequest

def consultar_alertas():
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT id, tipo_evento, fecha, hora, descripcion, cedula, nombres, apellidos,
                   celular, genero, fecha_nacimiento, edad, contacto_emergencia,
                   ST_AsGeoJSON(geom) AS geom
            FROM alertas
            ORDER BY id DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        for row in rows:
            if row['fecha']:           row['fecha']           = str(row['fecha'])
            if row['hora']:            row['hora']            = str(row['hora'])
            if row['fecha_nacimiento']:row['fecha_nacimiento'] = str(row['fecha_nacimiento'])

        return [dict(row) for row in rows]
    except Exception as e:
        print(f"Error consultando alertas: {e}")
        return []


def insertar_alerta(data: AlertaRequest):
    try:
        conn = get_connection()
        cur = conn.cursor()

        if data.latitud is not None and data.longitud is not None:
            geom_sql = f"ST_SetSRID(ST_MakePoint({data.longitud}, {data.latitud}), 4326)"
        else:
            geom_sql = "NULL"

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


def actualizar_alerta(alerta_id: int, data: AlertaRequest):
    try:
        conn = get_connection()
        cur = conn.cursor()

        if data.latitud is not None and data.longitud is not None:
            geom_sql = f"ST_SetSRID(ST_MakePoint({data.longitud}, {data.latitud}), 4326)"
        else:
            geom_sql = "NULL"

        cur.execute(f"""
            UPDATE alertas SET
                tipo_evento = %s, fecha = %s, hora = %s, descripcion = %s,
                cedula = %s, nombres = %s, apellidos = %s, celular = %s,
                genero = %s, fecha_nacimiento = %s, edad = %s,
                contacto_emergencia = %s, geom = {geom_sql}
            WHERE id = %s
        """, (
            data.tipo_evento, data.fecha, data.hora, data.descripcion,
            data.cedula, data.nombres, data.apellidos, data.celular,
            data.genero, data.fecha_nacimiento, data.edad, data.contacto_emergencia,
            alerta_id
        ))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error actualizando alerta: {e}")
        raise e
