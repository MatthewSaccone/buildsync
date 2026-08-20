from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status, Header
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.turnstile import verify_turnstile
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.core.limiter import limiter
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    generate_opaque_token,
    hash_opaque_token,
)
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.models.password_reset_token import PasswordResetToken
from app.schemas.schemas import (
    UserCreate,
    UserOut,
    UserUpdate,
    PasswordChange,
    TokenPair,
    RefreshRequest,
    PasswordResetRequest,
    PasswordResetConfirm,
)
from app.services.email_service import send_password_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_token_pair(db: Session, user: User) -> TokenPair:
    access_token = create_access_token({"sub": str(user.id)})

    raw_refresh = generate_opaque_token()
    refresh_row = RefreshToken(
        user_id=user.id,
        token_hash=hash_opaque_token(raw_refresh),
        expires_at=datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(refresh_row)
    db.commit()

    return TokenPair(access_token=access_token, refresh_token=raw_refresh)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", status_code=200)
def change_password(
    payload: PasswordChange,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    user.hashed_password = hash_password(payload.new_password)

    # Same reasoning as the forgot-password flow: revoke every other
    # session's refresh token once the password changes.
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked == False).update(  # noqa: E712
        {"revoked": True}
    )
    db.commit()
    return {"detail": "Password updated."}


@router.get("/lookup", response_model=UserOut)
def lookup_by_email(email: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    target = db.query(User).filter(User.email == email).first()
    if not target:
        raise HTTPException(status_code=404, detail="No user with that email")
    return target


@router.post("/signup", response_model=UserOut)
@limiter.limit("5/hour")
async def signup(request: Request, payload: UserCreate, db: Session = Depends(get_db)):
    if not await verify_turnstile(payload.turnstile_token, request.client.host if request.client else None):
        raise HTTPException(status_code=400, detail="Bot verification failed")

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        company_name=payload.company_name,
        role=payload.role,
        phone=payload.phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenPair)
@limiter.limit("5/minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    x_turnstile_token: str | None = Header(default=None),
):
    if not await verify_turnstile(x_turnstile_token, request.client.host if request.client else None):
        raise HTTPException(status_code=400, detail="Bot verification failed")

    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _issue_token_pair(db, user)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    token_hash = hash_opaque_token(payload.refresh_token)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

    invalid = HTTPException(status_code=401, detail="Invalid or expired refresh token")
    if not row:
        raise invalid

    if row.revoked:
        # This token was already used once and rotated out -- someone is
        # presenting a stale/stolen token. Treat as a possible compromise:
        # kill every active session for this user, not just this one.
        db.query(RefreshToken).filter(
            RefreshToken.user_id == row.user_id, RefreshToken.revoked == False  # noqa: E712
        ).update({"revoked": True})
        db.commit()
        raise invalid

    if row.expires_at < datetime.utcnow():
        raise invalid

    user = db.get(User, row.user_id)
    if not user:
        raise invalid

    # Rotate: revoke the used token and issue a fresh pair. Limits the blast
    # radius if a refresh token is ever stolen — it's single-use.
    row.revoked = True
    db.commit()

    return _issue_token_pair(db, user)


@router.post("/logout", status_code=204)
def logout(payload: RefreshRequest, db: Session = Depends(get_db)):
    token_hash = hash_opaque_token(payload.refresh_token)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if row:
        row.revoked = True
        db.commit()


@router.post("/password-reset/request", status_code=202)
@limiter.limit("3/hour")
def request_password_reset(request: Request, payload: PasswordResetRequest, db: Session = Depends(get_db)):
    # Always return 202 regardless of whether the email exists — don't leak account existence.
    user = db.query(User).filter(User.email == payload.email).first()
    if user:
        raw_token = generate_opaque_token()
        reset_row = PasswordResetToken(
            user_id=user.id,
            token_hash=hash_opaque_token(raw_token),
            expires_at=datetime.utcnow() + timedelta(minutes=settings.password_reset_token_expire_minutes),
        )
        db.add(reset_row)
        db.commit()
        send_password_reset_email(user.email, raw_token)
    return {"detail": "If that email exists, a reset link has been sent."}


@router.post("/password-reset/confirm", status_code=200)
def confirm_password_reset(payload: PasswordResetConfirm, db: Session = Depends(get_db)):
    token_hash = hash_opaque_token(payload.token)
    row = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first()

    invalid = HTTPException(status_code=400, detail="Invalid or expired reset token")
    if not row or row.used or row.expires_at < datetime.utcnow():
        raise invalid

    user = db.get(User, row.user_id)
    if not user:
        raise invalid

    user.hashed_password = hash_password(payload.new_password)
    row.used = True

    # Revoke every refresh token on the account — a password reset should
    # kick out any session that isn't the person who just proved they own the email.
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked == False).update(  # noqa: E712
        {"revoked": True}
    )
    db.commit()
    return {"detail": "Password updated."}
