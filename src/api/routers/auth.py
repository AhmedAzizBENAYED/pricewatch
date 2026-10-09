from datetime import datetime, timedelta, timezone
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from jose import jwt
from sqlalchemy.orm import Session

from src.api.deps import get_db, get_current_user, SECRET_KEY, ALGORITHM
from src.common.models import Admin, Tenant, Utilisateur

router = APIRouter(prefix="/auth", tags=["auth"])

ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    nom: str
    role: str
    tenant_id: int | None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


def _create_token(sub: str, role: str, tenant_id: int | None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": sub, "role": role, "tenant_id": tenant_id, "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    # Check admins first
    admin = db.query(Admin).filter(Admin.email == body.email).first()
    if admin and admin.password_hash and verify_password(body.password, admin.password_hash):
        token = _create_token(str(admin.id), "ADMIN", None)
        return TokenResponse(
            access_token=token,
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=UserOut(id=admin.id, nom=admin.nom, role="ADMIN", tenant_id=None),
        )

    # Then check utilisateurs
    user = db.query(Utilisateur).filter(Utilisateur.email == body.email).first()
    if user and user.password_hash and verify_password(body.password, user.password_hash):
        token = _create_token(str(user.id), user.role, user.tenant_id)
        return TokenResponse(
            access_token=token,
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=UserOut(id=user.id, nom=user.nom, role=user.role, tenant_id=user.tenant_id),
        )

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")


@router.get("/me")
def me(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if isinstance(current_user, Admin):
        return {
            "id": current_user.id,
            "nom": current_user.nom,
            "role": "ADMIN",
            "tenant_id": None,
            "nom_organisation": None,
            "plan_abonnement": None,
            "profil_client": None,
        }
    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    return {
        "id": current_user.id,
        "nom": current_user.nom,
        "email": current_user.email,
        "role": current_user.role,
        "tenant_id": current_user.tenant_id,
        "nom_organisation": tenant.nom_organisation if tenant else None,
        "plan_abonnement":  tenant.plan_abonnement  if tenant else None,
        "profil_client":    tenant.profil_client    if tenant else None,
        "own_site_slug":    (tenant.own_site.scraper_id if tenant.own_site else None) if tenant else None,
        "own_brand":        tenant.own_brand if tenant else None,
    }
