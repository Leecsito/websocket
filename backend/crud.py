# Lógica de acceso a datos (queries y escrituras)
from psycopg2.extras import RealDictCursor
from backend.database import get_connection
from backend.models import AlertaRequest

ESTADOS_ATENCION_VALIDOS = {"pendiente", "en_atencion", "cerrada"}


def validar_estado_atencion(estado: str):
    if estado not in ESTADOS_ATENCION_VALIDOS:
        raise ValueError("Estado de atencion no valido")
    return estado

def consultar_alertas():
    conn = get_connection()
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
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT id, email, phone, created_at, last_sign_in_at, raw_user_meta_data
        FROM auth.users
        ORDER BY created_at DESC
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    usuarios = []
    for row in rows:
        metadata = row.get("raw_user_meta_data") or {}
        usuarios.append({
            "id": str(row["id"]),
            "email": row.get("email"),
            "phone": row.get("phone"),
            "created_at": str(row["created_at"]) if row.get("created_at") else None,
            "last_sign_in_at": str(row["last_sign_in_at"]) if row.get("last_sign_in_at") else None,
            "nombre": metadata.get("name") or metadata.get("full_name") or metadata.get("nombres"),
        })

    return usuarios


def insertar_alerta(data: AlertaRequest):
    try:
        conn = get_connection()
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


def actualizar_alerta(alerta_id: int, data: AlertaRequest):
    try:
        conn = get_connection()
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
            data.latitud, data.longitud, alerta_id
        ))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error actualizando alerta: {e}")
        raise e


def actualizar_estado_atencion(alerta_id: int, estado_atencion: str):
    estado = validar_estado_atencion(estado_atencion)
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            UPDATE reportes_emergencia
            SET estado_atencion = %s
            WHERE id = %s
        """, (estado, alerta_id))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error actualizando estado de atencion: {e}")
        raise e
