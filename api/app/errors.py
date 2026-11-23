"""Uniform error format: {"error": {"code", "message", "fields"}} with Spanish messages."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

_STATUS_CODES: dict[int, tuple[str, str]] = {
    400: ("bad_request", "La solicitud no es válida."),
    401: ("unauthorized", "Tenés que iniciar sesión."),
    403: ("forbidden", "No tenés permiso para realizar esta acción."),
    404: ("not_found", "No encontramos lo que buscás."),
    405: ("method_not_allowed", "Método no permitido."),
    413: ("payload_too_large", "El archivo o la solicitud es demasiado grande."),
    422: ("validation_error", "Revisá los datos ingresados."),
    429: ("rate_limited", "Hiciste demasiados intentos. Probá de nuevo más tarde."),
    500: ("internal_error", "Ocurrió un error inesperado. Probá de nuevo en unos minutos."),
    503: ("unavailable", "El servicio no está disponible en este momento."),
}


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str | None = None,
        message: str | None = None,
        fields: dict[str, str] | None = None,
    ) -> None:
        default_code, default_message = _STATUS_CODES.get(status_code, _STATUS_CODES[400])
        self.status_code = status_code
        self.code = code or default_code
        self.message = message or default_message
        self.fields = fields or {}


def error_body(code: str, message: str, fields: dict[str, str] | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "fields": fields or {}}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(error_body(exc.code, exc.message, exc.fields), exc.status_code)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code, message = _STATUS_CODES.get(exc.status_code, ("error", "Ocurrió un error."))
        return JSONResponse(error_body(code, message), exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields: dict[str, str] = {}
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")]
            fields[".".join(loc) or "_"] = "Valor inválido."
        code, message = _STATUS_CODES[422]
        return JSONResponse(error_body(code, message, fields), 422)
