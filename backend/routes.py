# Rutas HTTP y WebSocket
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from backend.models import AlertaRequest
from backend.crud import consultar_alertas, insertar_alerta, actualizar_alerta

router = APIRouter()


@router.post("/alertas")
async def crear_alerta(req: AlertaRequest):
    await run_in_threadpool(insertar_alerta, req)
    return {"message": "Alerta registrada exitosamente"}


@router.put("/alertas/{alerta_id}")
async def editar_alerta(alerta_id: int, req: AlertaRequest):
    await run_in_threadpool(actualizar_alerta, alerta_id, req)
    return {"message": "Alerta actualizada exitosamente"}


@router.websocket("/ws/alertas")
async def websocket_alertas(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            datos = await run_in_threadpool(consultar_alertas)
            await websocket.send_json(datos)
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
