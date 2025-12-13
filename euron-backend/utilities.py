from fastapi import HTTPException, Depends
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from schemas import UserSignup

import models
from database import SessionLocal

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)



def authenticate_user(db: Session, email: str, password: str):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        return False
    if not verify_password(password, user.password):
        return False
    return user


def add_new_user(db: Session, user_in: UserSignup):
    existing = db.query(models.User).filter(models.User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed = pwd_context.hash(user_in.password)

    new_user = models.User(
        email=user_in.email,
        name=user_in.name,
        password=hashed
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    print("user created !!")

    return {"id": new_user.id, "name": new_user.name, "email": new_user.email}
