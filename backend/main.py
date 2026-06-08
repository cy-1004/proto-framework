import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = os.path.dirname(__file__)
load_dotenv(os.path.join(BASE_DIR, ".env"))

from db import init_db
from deps import ENABLE_LOGIN, _extract_user_from_token
from routers.tasks import router as tasks_router
from routers.debug import router as debug_router
from routers.chat import router as chat_router
from routers.assets import router as assets_router
from routers.generate import router as generate_router
from routers.narations import router as narations_router
from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.products import router as products_router
from routers.tiktok import router as tiktok_router
from services.ToolsCollection.transcribe import router as tools_router
from services.ToolsCollection.copywrite import router as tools_copywrite_router
from services.ToolsCollection.tts import router as tools_tts_router
from services.ToolsCollection.video import router as tools_video_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AUTH_WHITELIST = (
    "/api/auth/config", "/api/auth/login",
    "/media", "/docs", "/openapi.json",
    "/api/tools/jobs/",       # SSE stream — EventSource can't send auth headers
    "/api/generate/jobs/",    # same issue for existing generate stream
)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if ENABLE_LOGIN:
        path = request.url.path
        if not any(path.startswith(w) for w in AUTH_WHITELIST):
            user = _extract_user_from_token(request)
            if not user:
                return JSONResponse(status_code=401, content={"detail": "未登录或 token 无效"})
            request.state.user = user
    response = await call_next(request)
    return response


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(tasks_router)
app.include_router(debug_router)
app.include_router(chat_router)
app.include_router(assets_router)
app.include_router(generate_router)
app.include_router(narations_router)
app.include_router(products_router)
app.include_router(tiktok_router)
app.include_router(tools_router)
app.include_router(tools_copywrite_router)
app.include_router(tools_tts_router)
app.include_router(tools_video_router)

media_dir = os.path.join(BASE_DIR, "media")
os.makedirs(media_dir, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_dir), name="media")

init_db()
