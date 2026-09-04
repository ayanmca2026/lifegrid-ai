from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
import time
import jwt

router = APIRouter(prefix="/auth", tags=["auth"])

SECRET_KEY = "supersecretkey"
ALGORITHM = "HS256"

class Token(BaseModel):
    access_token: str
    token_type: str

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # Mock auth for hackathon demo
    if form_data.username == "admin" and form_data.password == "admin":
        payload = {
            "sub": form_data.username,
            "role": "ADMIN",
            "exp": time.time() + 3600
        }
        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        return {"access_token": token, "token_type": "bearer"}
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password"
    )
