from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role
from src.api.routers.auth import hash_password, verify_password
from src.common.models import Utilisateur

router = APIRouter()

_ROLES = ("MANAGER", "RESP_MARKETING", "EQUIPE_MARKETING")


class UpdateProfileBody(BaseModel):
    nom:   str | None = None
    email: str | None = None


class UpdatePasswordBody(BaseModel):
    current_password: str
    new_password:     str
    confirm_password: str


@router.patch("/users/me")
def update_profile(
    body: UpdateProfileBody,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    if body.nom is not None:
        current_user.nom = body.nom
    if body.email is not None:
        taken = (
            db.query(Utilisateur)
            .filter(Utilisateur.email == body.email, Utilisateur.id != current_user.id)
            .first()
        )
        if taken:
            raise HTTPException(status_code=400, detail="Email déjà utilisé")
        current_user.email = body.email
    db.commit()
    db.refresh(current_user)
    return {
        "id":        current_user.id,
        "nom":       current_user.nom,
        "email":     current_user.email,
        "role":      current_user.role,
        "tenant_id": current_user.tenant_id,
    }


@router.patch("/users/me/password")
def update_password(
    body: UpdatePasswordBody,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    if body.confirm_password != body.new_password:
        raise HTTPException(status_code=400, detail="Les mots de passe ne correspondent pas")
    if not current_user.password_hash or not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="8 caractères minimum")
    current_user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Mot de passe mis à jour"}
