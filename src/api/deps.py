import os
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from src.common.database import SessionLocal
from src.common.models import Admin, Utilisateur, OffreNormalisee, Categorie, TenantCategorie, Tenant

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "changeme-in-production")
ALGORITHM  = "HS256"

_bearer = HTTPBearer()


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        sub: str  = payload.get("sub")
        role: str = payload.get("role")
        if not sub or not role:
            raise ValueError
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if role == "ADMIN":
        user = db.query(Admin).filter(Admin.id == int(sub)).first()
        if user and not getattr(user, "est_actif", False):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account inactive")
    else:
        user = db.query(Utilisateur).filter(Utilisateur.id == int(sub)).first()
        if user and not getattr(user, "est_actif", False):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account inactive")

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_role(*roles: str):
    def dependency(current_user=Depends(get_current_user)):
        role = "ADMIN" if isinstance(current_user, Admin) else current_user.role
        if role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return dependency


def require_plan(minimum_plan: str):
    PLAN_ORDER = {'BASIC': 0, 'MEDIUM': 1, 'PREMIUM': 2}

    def checker(
        current_user=Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if isinstance(current_user, Admin) or not hasattr(current_user, 'tenant_id'):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access only")
        tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
        user_level = PLAN_ORDER.get(getattr(tenant, 'plan_abonnement', 'BASIC'), 0)
        required_level = PLAN_ORDER.get(minimum_plan, 0)
        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Plan {minimum_plan} requis",
            )
        return current_user

    return checker


def get_tenant_id(current_user=Depends(get_current_user)):
    if isinstance(current_user, Admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins have no tenant")
    return current_user.tenant_id


def tenant_offers_query(db: Session, tenant_id: int):
    return (
        db.query(OffreNormalisee)
        .join(Categorie,      Categorie.id      == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(TenantCategorie.tenant_id == tenant_id)
        .filter(OffreNormalisee.categorie_id.isnot(None))
    )