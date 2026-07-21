# Modelos Pydantic (esquemas de entrada/salida)
from pydantic import BaseModel
from typing import Optional

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
