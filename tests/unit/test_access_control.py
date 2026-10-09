"""Authentication and authorization dependencies: JWT, roles, plans, tenant scoping."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt

from src.api import deps
from src.common.models import Admin, Utilisateur


def token(sub="7", role="RESP_MARKETING", tenant_id=3, secret=None, expired=False):
    exp = datetime.now(timezone.utc) + timedelta(minutes=-5 if expired else 5)
    payload = {"sub": sub, "role": role, "tenant_id": tenant_id, "exp": exp}
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=jwt.encode(payload, secret or deps.SECRET_KEY, algorithm="HS256"))


def db_returning(obj):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = obj
    return db


def tenant_user(role="RESP_MARKETING", tenant_id=3):
    return Utilisateur(id=7, role=role, tenant_id=tenant_id, est_actif=True)


def assert_http(exc_info, status):
    assert exc_info.value.status_code == status


# ── get_current_user ─────────────────────────────────────────────────────────

def test_valid_token_returns_active_user():
    user = tenant_user()
    assert deps.get_current_user(token(), db_returning(user)) is user


@pytest.mark.parametrize(
    "creds",
    [
        token(secret="another-key"),  # forged signature
        token(expired=True),
        token(role=None),  # missing claim
        HTTPAuthorizationCredentials(scheme="Bearer", credentials="not-a-jwt"),
    ],
    ids=["forged", "expired", "missing-role", "garbage"],
)
def test_invalid_tokens_are_rejected(creds):
    with pytest.raises(HTTPException) as exc:
        deps.get_current_user(creds, db_returning(tenant_user()))
    assert_http(exc, 401)


def test_inactive_user_is_rejected():
    user = tenant_user()
    user.est_actif = False
    with pytest.raises(HTTPException) as exc:
        deps.get_current_user(token(), db_returning(user))
    assert_http(exc, 401)


def test_deleted_user_is_rejected():
    with pytest.raises(HTTPException) as exc:
        deps.get_current_user(token(), db_returning(None))
    assert_http(exc, 401)


def test_admin_token_resolves_an_admin():
    admin = Admin(id=1, nom="root", email="a@x.tn", est_actif=True)
    assert deps.get_current_user(token(sub="1", role="ADMIN", tenant_id=None), db_returning(admin)) is admin


# ── require_role ─────────────────────────────────────────────────────────────

def test_role_allowed():
    check = deps.require_role("RESP_MARKETING", "MANAGER")
    user = tenant_user("MANAGER")
    assert check(current_user=user) is user


def test_role_forbidden():
    check = deps.require_role("RESP_MARKETING")
    with pytest.raises(HTTPException) as exc:
        check(current_user=tenant_user("EQUIPE_MARKETING"))
    assert_http(exc, 403)


def test_admin_cannot_use_tenant_only_routes():
    check = deps.require_role("RESP_MARKETING", "MANAGER", "EQUIPE_MARKETING")
    with pytest.raises(HTTPException) as exc:
        check(current_user=Admin(id=1, nom="root", email="a@x.tn"))
    assert_http(exc, 403)


# ── require_plan ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "tenant_plan, required, allowed",
    [
        ("BASIC", "BASIC", True),
        ("BASIC", "MEDIUM", False),
        ("MEDIUM", "MEDIUM", True),
        ("MEDIUM", "PREMIUM", False),
        ("PREMIUM", "MEDIUM", True),
        ("PREMIUM", "PREMIUM", True),
    ],
)
def test_plan_gating(tenant_plan, required, allowed):
    check = deps.require_plan(required)
    db = db_returning(SimpleNamespace(plan_abonnement=tenant_plan))
    user = tenant_user()
    if allowed:
        assert check(current_user=user, db=db) is user
    else:
        with pytest.raises(HTTPException) as exc:
            check(current_user=user, db=db)
        assert_http(exc, 403)


def test_plan_gated_routes_reject_admins():
    with pytest.raises(HTTPException) as exc:
        deps.require_plan("BASIC")(current_user=Admin(id=1, nom="root", email="a@x.tn"), db=MagicMock())
    assert_http(exc, 403)


# ── tenant scoping ───────────────────────────────────────────────────────────

def test_tenant_id_comes_from_the_authenticated_user():
    assert deps.get_tenant_id(current_user=tenant_user(tenant_id=9)) == 9


def test_admins_have_no_tenant():
    with pytest.raises(HTTPException) as exc:
        deps.get_tenant_id(current_user=Admin(id=1, nom="root", email="a@x.tn"))
    assert_http(exc, 403)
