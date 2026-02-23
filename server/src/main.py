from fastapi import FastAPI

app = FastAPI(title="Учет времени выполнения задач", version="1.0.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
