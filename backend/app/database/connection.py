from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)
elif db_url.startswith("http://") or db_url.startswith("https://"):
    print(f"WARNING: DATABASE_URL is set to an HTTP(S) URL ('{db_url}'). It must be a PostgreSQL connection string (postgresql://...). Falling back to SQLite.")
    db_url = "sqlite:///./lifegrid.db"

engine = create_engine(
    db_url, 
    connect_args={"check_same_thread": False} if "sqlite" in db_url else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
