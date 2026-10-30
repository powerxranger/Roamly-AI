import os
from pathlib import Path
import traceback
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
_env_file = BASE_DIR / ".env"
if _env_file.is_file():
    load_dotenv(dotenv_path=_env_file, override=False)
load_dotenv(override=False)

import uvicorn

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from src.api.sessions import (
    SESSION_COOKIE,
    SESSION_TTL_SECONDS,
    clear_credentials,
    get_credentials_for,
    new_session_id,
    store_credentials,
)
from src.api.validation import check_database_url, check_groq_api_key
from src.clients import cache
from src.config.session import (
    MissingCredentialsError,
    credential_status,
    use_credentials,
)
from src.config.settings import COOKIE_SAMESITE, COOKIE_SECURE, CORS_ORIGINS
from src.graph.runner import run_travel_agent

# This is to allow nested event loops for async calls in FastAPI
import nest_asyncio
nest_asyncio.apply()


BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
DIST_DIR = BASE_DIR / "dist"
CLIENT_DIST_DIR = BASE_DIR / "client" / "dist"

app = FastAPI(
    title="Roamly AI",
    description="Autonomous Multi-Agent Travel Planner with FastAPI Frontend",
    version="1.0.0"
)


# Enable CORS for Vercel frontend deployments, local development, and custom domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS else ["*"],
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.mount(
    "/static",
    StaticFiles(directory=str(FRONTEND_DIR / "static")),
    name="static"
)

if (CLIENT_DIST_DIR / "assets").exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(CLIENT_DIST_DIR / "assets")),
        name="client-assets"
    )
elif (DIST_DIR / "assets").exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(DIST_DIR / "assets")),
        name="assets"
    )


templates = Jinja2Templates(
    directory=str(FRONTEND_DIR / "templates")
)



class TravelRequest(BaseModel):
    message: str
    thread_id: str | None = None
    destination: str | None = None


class ConfigRequest(BaseModel):
    """
    None leaves a field untouched, "" clears it. Keys are held in server
    memory for this session only and are never echoed back.
    """

    groq_api_key: str | None = None
    database_url: str | None = None



def _session_id(request: Request) -> str | None:
    return request.cookies.get(SESSION_COOKIE)


def _set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
    )



@app.get("/")
async def root(request: Request):
    """
    Root route:
    - If accessed from a web browser locally and the React build exists, serve the UI.
    - Otherwise (on Render backend or API calls), return the JSON API status.
    """
    accept = request.headers.get("accept", "")
    is_browser = "text/html" in accept

    if is_browser:
        # 1. Check for built React SPA in client/dist
        if (CLIENT_DIST_DIR / "index.html").exists():
            with open(CLIENT_DIST_DIR / "index.html", "r", encoding="utf-8") as f:
                return HTMLResponse(content=f.read())
        # 2. Check for built React SPA in dist
        if (DIST_DIR / "index.html").exists():
            with open(DIST_DIR / "index.html", "r", encoding="utf-8") as f:
                return HTMLResponse(content=f.read())
        # 3. Check for legacy frontend templates
        if (FRONTEND_DIR / "templates" / "index.html").exists():
            return templates.TemplateResponse(request=request, name="index.html", context={})

    return {
        "service": "Roamly AI Multi-Agent Travel Planner API",
        "status": "online",
        "docs": "/docs",
        "health": "/health",
        "frontend_dev_url": "http://localhost:5173",
    }


# =========================
# Credentials
# =========================

@app.get("/api/config")
async def read_config(request: Request):
    """What is configured, and where it came from. Never returns a secret."""

    credentials = get_credentials_for(_session_id(request))

    with use_credentials(credentials):
        return JSONResponse(content=credential_status())


@app.post("/api/config")
async def write_config(request: Request, body: ConfigRequest):
    """
    Store credentials for this browser session. Each supplied value is
    checked against the real service before being accepted.
    """

    session_id = _session_id(request) or new_session_id()

    errors = {}

    groq_key = (body.groq_api_key or "").strip()
    if groq_key:
        ok, detail = check_groq_api_key(groq_key)
        if not ok:
            errors["groq_api_key"] = detail

    database_url = (body.database_url or "").strip()
    if database_url:
        ok, detail = check_database_url(database_url)
        if not ok:
            errors["database_url"] = detail

    if errors:
        response = JSONResponse(
            status_code=400,
            content={"success": False, "errors": errors},
        )
        _set_session_cookie(response, session_id)
        return response

    credentials = store_credentials(
        session_id,
        groq_api_key=body.groq_api_key,
        database_url=body.database_url,
    )

    with use_credentials(credentials):
        payload = {"success": True, **credential_status()}

    response = JSONResponse(content=payload)
    _set_session_cookie(response, session_id)

    return response


@app.delete("/api/config")
async def reset_config(request: Request):
    """Drop session keys and fall back to whatever the server's .env has."""

    clear_credentials(_session_id(request))

    with use_credentials(None):
        return JSONResponse(content={"success": True, **credential_status()})


# =========================
# Planning
# =========================

@app.post("/api/travel")
async def travel_planner(request: Request, request_data: TravelRequest):
    credentials = get_credentials_for(_session_id(request))

    try:
        user_message = request_data.message.strip()

        if not user_message:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Message cannot be empty."
                }
            )

        with use_credentials(credentials):
            result = run_travel_agent(
                user_input=user_message,
                thread_id=request_data.thread_id,
                destination=request_data.destination,
            )

        return JSONResponse(
            content={
                "success": True,
                "thread_id": result["thread_id"],
                "destination": result.get("destination", ""),
                "answer": result["answer"],
                "is_followup": result.get("is_followup", False),
                "flight_results": result.get("flight_results", ""),
                "hotel_results": result.get("hotel_results", ""),
                "weather_results": result.get("weather_results", ""),
                "itinerary": result.get("itinerary", ""),
                "llm_calls": result.get("llm_calls", 0),
                "budget_breakdown": result.get("budget_breakdown", ""),
                "packing_list": result.get("packing_list", ""),
                "must_visit": result.get("must_visit", ""),
                "travel_essentials": result.get("travel_essentials", ""),
            }
        )

    except MissingCredentialsError as e:
        # The frontend turns this into a prompt to open Settings.
        return JSONResponse(
            status_code=428,
            content={
                "success": False,
                "error": str(e),
                "missing": e.missing,
            }
        )

    except Exception as e:
        print("ERROR:", e)
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e)
            }
        )



@app.head("/", include_in_schema=False)
async def home_head():
    """Hosting platforms probe with HEAD to detect an open port."""

    return Response(status_code=200)


@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check(request: Request):
    credentials = get_credentials_for(_session_id(request))

    with use_credentials(credentials):
        status = credential_status()

    return {
        "status": "ok",
        "message": "AI Travel Planner API is running",
        "ready": status["ready"],
        "missing": status["missing"],
        "cache": cache.status(),
    }


@app.get("/favicon.ico")
async def favicon():
    return JSONResponse(content={})



if __name__ == "__main__":
    # Defaults suit local development. In Docker, HOST is set to 0.0.0.0
    # so the port is reachable from outside the container.
    uvicorn.run(
        "app:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("RELOAD", "true").lower() not in ("false", "0", "no")
    )
