from database import SessionLocal
from models import User
from passlib.context import CryptContext

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

db = SessionLocal()
u = User(email="you@example.com", password=pwd.hash("mypassword"))
db.add(u)
db.commit()
db.close()
