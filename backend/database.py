# Configuración de la conexión a la base de datos
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = "postgresql://postgres.vlovptmkmpxihzljbdku:ZfhsfN3jXKuyJZRu@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

def get_connection():
    return psycopg2.connect(DB_URL)
