"""PartsDonor B8 — аутентификация и RBAC.

Схема:
  - таблица users (id uuid, email unique, password_hash, role seller|buyer|admin,
    company_id FK -> companies nullable, created_at);
  - POST /auth/register — регистрация buyer/seller (для seller опционально
    создаём/прикрепляем Company — мастерскую);
  - POST /auth/login — email+password -> JWT (HS256) + role + user id;
  - зависимости get_current_user (Bearer) и require_roles(...) для RBAC;
  - GET /admin/users — только admin.

Пароли — bcrypt через passlib; JWT — PyJWT, секрет/время жизни из настроек
(PARTSDONOR_JWT_SECRET / PARTSDONOR_JWT_EXPIRE_MINUTES).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import Company, User, UserRole

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

bearer_scheme = HTTPBearer(auto_error=False)

auth_router = APIRouter(prefix="/auth", tags=["auth"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])


# --- схемы запросов/ответов ---


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    role: UserRole  # seller | buyer | admin (admin допускаем только через seed/скрипт)
    company_name: str | None = None  # для seller: создать мастерскую


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    role: UserRole
    company_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    user_id: uuid.UUID
    company_id: uuid.UUID | None = None


class AdminUserOut(UserOut):
    created_at: datetime
    company_name: str | None = None


# --- пароли / JWT ---


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": str(user.id),
        "role": user.role.value if isinstance(user.role, UserRole) else user.role,
        "company_id": str(user.company_id) if user.company_id else None,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


# --- зависимости ---


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Bearer token -> User. 401 при отсутствии/неваличном токене."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    user = await db.get(User, uuid.UUID(str(payload.get("sub"))))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_roles(*roles: UserRole):
    """Фабрика зависимости: допускает только указанные роли (иначе 403)."""

    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user

    return _dep


# --- роуты ---


@auth_router.post("/register", response_model=UserOut, status_code=201)
async def register(payload: RegisterIn, db: AsyncSession = Depends(get_db)) -> User:
    existing = (
        await db.execute(select(User).where(User.email == payload.email.lower()))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Email уже зарегистрирован")
    if payload.role == UserRole.admin:
        raise HTTPException(status_code=403, detail="Регистрация admin запрещена")

    company_id: uuid.UUID | None = None
    if payload.role == UserRole.seller:
        # seller регистрируется вместе с мастерской (Company); повторный email
        # компании не допускаем — создаём новую с уникальным slug
        name = payload.company_name or payload.email.split("@")[0]
        base_slug = name.lower().replace(" ", "-")[:100]
        slug = base_slug
        n = 1
        while (await db.execute(select(Company).where(Company.slug == slug))).scalar_one_or_none():
            n += 1
            slug = f"{base_slug}-{n}"
        company = Company(name=name, role="seller", slug=slug)
        db.add(company)
        await db.flush()
        company_id = company.id
    elif payload.role == UserRole.buyer:
        # buyer тоже получает собственную компанию — иначе сделки покупателя
        # нельзя продвигать (user.company_id должен совпадать с buyer_company_id)
        name = payload.company_name or payload.email.split("@")[0]
        base_slug = name.lower().replace(" ", "-")[:100]
        slug = base_slug
        n = 1
        while (await db.execute(select(Company).where(Company.slug == slug))).scalar_one_or_none():
            n += 1
            slug = f"{base_slug}-{n}"
        company = Company(name=name, role="buyer", slug=slug)
        db.add(company)
        await db.flush()
        company_id = company.id

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=payload.role,
        company_id=company_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@auth_router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn, db: AsyncSession = Depends(get_db)) -> TokenOut:
    user = (
        await db.execute(select(User).where(User.email == payload.email.lower()))
    ).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный email или пароль")
    return TokenOut(
        access_token=create_access_token(user),
        role=user.role,
        user_id=user.id,
        company_id=user.company_id,
    )


@admin_router.get("/users", response_model=list[AdminUserOut])
async def admin_list_users(
    user: User = Depends(require_roles(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    return list((await db.execute(select(User).order_by(User.created_at))).scalars().all())
