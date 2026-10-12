# BuildTrack Backend Setup Guide - FastAPI + PostgreSQL + Supabase

## Initial Setup

### 1. Project Structure & Dependencies

```bash
buildtrack-backend/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── dependencies.py
│   ├── middleware.py
│   ├── api/
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── router.py
│   │   │   └── endpoints/
│   │   │       ├── auth.py
│   │   │       ├── projects.py
│   │   │       ├── blueprints.py
│   │   │       ├── progress.py
│   │   │       ├── qa_defects.py
│   │   │       ├── workers.py
│   │   │       └── timekeeping.py
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── project.py
│   │   ├── blueprint.py
│   │   ├── defect.py
│   │   └── timesheet.py
│   ├── db/
│   │   ├── __init__.py
│   │   ├── database.py
│   │   ├── base.py
│   │   ├── crud.py
│   │   └── models.py (ORM models)
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── project.py
│   │   └── defect.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   ├── project_service.py
│   │   ├── qa_service.py
│   │   └── payroll_service.py
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── jwt.py
│   │   └── rbac.py
│   ├── websocket/
│   │   ├── __init__.py
│   │   └── manager.py
│   └── utils/
│       ├── __init__.py
│       ├── logger.py
│       └── validators.py
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
├── requirements.txt
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── README.md
```

### 2. requirements.txt

```txt
# Web Framework
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-multipart==0.0.6
python-dotenv==1.0.0

# Database
sqlalchemy==2.0.23
alembic==1.12.1
psycopg2-binary==2.9.9
asyncpg==0.29.0

# Supabase
supabase==2.3.4

# Authentication
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
pydantic-settings==2.1.0

# Data Validation
pydantic==2.5.0
pydantic[email]==2.5.0

# WebSocket & Real-time
websockets==12.0

# Security
python-dotenv==1.0.0
cryptography==41.0.7

# Utilities
python-dateutil==2.8.2
requests==2.31.0

# Testing
pytest==7.4.3
pytest-asyncio==0.21.1
httpx==0.25.2

# Development
black==23.12.0
flake8==6.1.0
isort==5.13.2
```

### 3. app/config.py

```python
from pydantic_settings import BaseSettings
from functools import lru_cache
import os

class Settings(BaseSettings):
    # App
    APP_NAME: str = "BuildTrack API"
    DEBUG: bool = bool(os.getenv("DEBUG", False))
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql://user:password@localhost:5432/buildtrack"
    )
    
    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_API_KEY: str = os.getenv("SUPABASE_API_KEY", "")
    
    # JWT
    JWT_SECRET: str = os.getenv("JWT_SECRET", "your-secret-key-change-in-prod")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 1
    
    # CORS
    ALLOWED_ORIGINS: list = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://yourdomain.com"
    ]
    
    # File Storage
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_FILE_TYPES: list = ["jpg", "jpeg", "png", "pdf"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True

@lru_cache()
def get_settings():
    return Settings()
```

### 4. app/db/database.py

```python
from sqlalchemy.ext.asyncio import (
    create_async_engine, 
    AsyncSession, 
    async_sessionmaker
)
from sqlalchemy.pool import NullPool
from app.config import get_settings

settings = get_settings()

# Async SQLAlchemy engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
    poolclass=NullPool,  # Important for Supabase serverless
)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def get_db():
    """Dependency: Database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
```

### 5. app/db/models.py (ORM Models)

```python
from sqlalchemy import (
    Column, String, Integer, DateTime, 
    ForeignKey, Boolean, Float, Text, 
    ARRAY, Enum as SQLEnum, JSON, POINT, TIMESTAMP
)
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime
import uuid
import enum

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=False)
    phone = Column(String)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="worker")  # admin, foreman, engineer, worker, qa_inspector
    biometric_enrolled = Column(Boolean, default=False)
    status = Column(String, default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    projects = relationship("Project", secondary="user_project", back_populates="members")
    timesheets = relationship("Timesheet", back_populates="worker")
    
    __table_args__ = (
        {"schema": "public"},
    )

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    location = Column(POINT)  # PostgreSQL POINT type: (latitude, longitude)
    site_manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    status = Column(String, default="active")  # active, archived, completed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    blueprints = relationship("Blueprint", back_populates="project", cascade="all, delete-orphan")
    defects = relationship("QADefect", back_populates="project", cascade="all, delete-orphan")
    timesheets = relationship("Timesheet", back_populates="project", cascade="all, delete-orphan")

class Blueprint(Base):
    __tablename__ = "blueprints"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False)
    file_path = Column(String)  # Supabase Storage path
    file_type = Column(String)  # pdf, png, jpg
    dimensions_width = Column(Integer)
    dimensions_height = Column(Integer)
    scale_ratio = Column(Float)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="blueprints")
    milestones = relationship("ProgressMilestone", back_populates="blueprint", cascade="all, delete-orphan")

class ProgressMilestone(Base):
    __tablename__ = "progress_milestones"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blueprint_id = Column(UUID(as_uuid=True), ForeignKey("blueprints.id"), nullable=False)
    name = Column(String, nullable=False)
    x_coord = Column(Float, nullable=False)
    y_coord = Column(Float, nullable=False)
    status = Column(String, default="pending")  # pending, in_progress, completed
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    completion_date = Column(DateTime)
    photos_url = Column(ARRAY(String))  # Array of URLs from Supabase
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    blueprint = relationship("Blueprint", back_populates="milestones")

class QADefect(Base):
    __tablename__ = "qa_defects"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    blueprint_id = Column(UUID(as_uuid=True), ForeignKey("blueprints.id"))
    location_x = Column(Float)
    location_y = Column(Float)
    defect_category = Column(String)  # structural, electrical, plumbing, etc.
    severity = Column(String)  # low, medium, high, critical
    description = Column(Text)
    photographic_evidence = Column(ARRAY(String))  # URLs from Supabase
    reported_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    status = Column(String, default="open")  # open, in_review, resolved, closed
    resolution_notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime)
    
    # Relationships
    project = relationship("Project", back_populates="defects")

class Timesheet(Base):
    __tablename__ = "worker_timesheets"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    worker_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    clock_in = Column(DateTime, nullable=False)
    clock_out = Column(DateTime)
    hours_worked = Column(Float)
    daily_wage = Column(Float)
    overtime_hours = Column(Float, default=0)
    overtime_multiplier = Column(Float, default=1.25)
    total_compensation = Column(Float)
    biometric_validated = Column(Boolean, default=False)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    worker = relationship("User", back_populates="timesheets")
    project = relationship("Project", back_populates="timesheets")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    action = Column(String, nullable=False)  # create, update, delete, approve
    resource_type = Column(String)  # project, defect, timesheet
    resource_id = Column(String)
    changes = Column(JSON)  # {"field": {"old": "", "new": ""}}
    ip_address = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
```

### 6. app/main.py

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import get_settings
from app.api.v1 import router as api_v1_router
from app.middleware import AuditLoggingMiddleware, ErrorHandlingMiddleware

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 BuildTrack API starting up...")
    yield
    # Shutdown
    print("🛑 BuildTrack API shutting down...")

app = FastAPI(
    title=settings.APP_NAME,
    description="2D Mapping Platform for Construction Site Progress & QA",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom Middleware
app.add_middleware(ErrorHandlingMiddleware)
app.add_middleware(AuditLoggingMiddleware)

# Include API routes
app.include_router(api_v1_router, prefix="/api/v1")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}

@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "docs": "/docs",
        "openapi": "/openapi.json"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
    )
```

### 7. app/schemas/user.py (Pydantic Models)

```python
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from uuid import UUID
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    phone: Optional[str] = None
    role: str = "worker"

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(UserBase):
    id: UUID
    status: str
    biometric_enrolled: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse
```

### 8. app/api/v1/endpoints/auth.py

```python
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.database import get_db
from app.db.models import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, TokenResponse
from app.auth.jwt import create_access_token, verify_password, hash_password
from datetime import timedelta

router = APIRouter(prefix="/auth", tags=["authentication"])

@router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if email exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    existing_user = result.scalars().first()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    new_user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        phone=user_data.phone,
        password_hash=hash_password(user_data.password),
        role=user_data.role,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    return new_user

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    # Find user
    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalars().first()
    
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create token
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role},
        expires_delta=timedelta(hours=1),
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user,
    }

@router.get("/me", response_model=UserResponse)
async def get_current_user(current_user: User = Depends(get_current_user)):
    return current_user
```

### 9. app/auth/jwt.py

```python
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthCredentials
from app.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=1))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthCredentials = Depends(security)):
    try:
        payload = jwt.decode(
            credentials.credentials, 
            settings.JWT_SECRET, 
            algorithms=[settings.JWT_ALGORITHM]
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Fetch user from DB (simplified)
    # In production: add caching
    return user_id
```

### 10. docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: buildtrack
      POSTGRES_PASSWORD: secure_password_change_me
      POSTGRES_DB: buildtrack
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U buildtrack"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: .
    environment:
      DATABASE_URL: postgresql+asyncpg://buildtrack:secure_password_change_me@postgres:5432/buildtrack
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_API_KEY: ${SUPABASE_API_KEY}
      JWT_SECRET: ${JWT_SECRET}
      DEBUG: "true"
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - .:/app

volumes:
  postgres_data:
```

### 11. Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Run migrations and start server
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 12. .env.example

```env
# FastAPI
DEBUG=true

# Database
DATABASE_URL=postgresql+asyncpg://buildtrack:password@localhost:5432/buildtrack

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_API_KEY=your_supabase_key

# JWT
JWT_SECRET=your_super_secret_key_change_this_in_production
JWT_ALGORITHM=HS256

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

## Running Locally

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env from example
cp .env.example .env

# Start Docker services
docker-compose up -d

# Run migrations
alembic upgrade head

# Start FastAPI
uvicorn app.main:app --reload

# API docs available at: http://localhost:8000/docs
```

## Next Steps

1. Create Project & Blueprint endpoints
2. Add WebSocket support
3. Integrate Supabase Storage
4. Implement QA Defect logging
5. Add biometric timekeeping
6. Build Payroll calculation engine
7. Add comprehensive testing
