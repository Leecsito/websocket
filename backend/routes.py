# Rutas HTTP y WebSocket
import asyncio
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from backend.models import AlertaRequest, EstadoAtencionRequest
from backend.crud import consultar_alertas, insertar_alerta, actualizar_alerta, actualizar_estado_atencion

router = APIRouter()


@router.post("/alertas")
async def crear_alerta(req: AlertaRequest):
    await run_in_threadpool(insertar_alerta, req)
    return {"message": "Alerta registrada exitosamente"}


@router.put("/alertas/{alerta_id}")
async def editar_alerta(alerta_id: int, req: AlertaRequest):
    await run_in_threadpool(actualizar_alerta, alerta_id, req)
    return {"message": "Alerta actualizada exitosamente"}


@router.patch("/alertas/{alerta_id}/estado")
async def editar_estado_alerta(alerta_id: int, req: EstadoAtencionRequest):
    try:
        await run_in_threadpool(actualizar_estado_atencion, alerta_id, req.estado_atencion)
        return {"message": "Estado de atencion actualizado exitosamente"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


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
