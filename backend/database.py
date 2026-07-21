# Configuración de la conexión a la base de datos
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = "postgresql://postgres:dadI9bzMWNPS2zxp@db.vlovptmkmpxihzljbdku.supabase.co:5432/postgres"

def get_connection():
    return psycopg2.connect(DB_URL)
