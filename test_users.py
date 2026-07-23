import psycopg2
from psycopg2.extras import RealDictCursor

_pwd = "ZfhsfN3jXKuyJZRu"
DB_URL = f"postgresql://postgres.vlovptmkmpxihzljbdku:{_pwd}@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

def get_db_connection():
    return psycopg2.connect(DB_URL)

def consultar_usuarios():
    conn = get_db_connection()
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

print(consultar_usuarios())
