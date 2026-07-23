# Modelos Pydantic (esquemas de entrada/salida)
from pydantic import BaseModel
from typing import Optional

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
