# create_db_and_add_user.py
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
import models
import os

# Ensure Base metadata is correct (this will create the users table)
Base.metadata.create_all(bind=engine)
print("Created tables (if they didn't exist) in", getattr(engine, "url", "unknown"))

# Password hashing setup (use bcrypt or argon2 as you prefer)
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Insert a test user if not present
db: Session = SessionLocal()
try:
    existing = db.query(models.User).filter(models.User.email == "you@example.com").first()
    if existing:
        print("Test user already exists:", existing.email)
    else:
        hashed = pwd.hash("mypassword")
        new_user = models.User(name="test", email="you@example.com", password=hashed)
        db.add(new_user)
        db.commit()
        print("Inserted test user:", new_user.email)
finally:
    db.close()
