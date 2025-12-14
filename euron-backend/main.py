import os
import json
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Set

from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    Path,
    Body,
    status,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, aliased
from sqlalchemy import desc

from database import Base, engine, SessionLocal
import models
from schemas import (
    UserLogin,
    UserSignup,
    ConversationListItem,
    MessageOut,
    SendMessageIn,
    UserOut,
    Start1to1In,
    CreateGroupIn
)
from utilities import authenticate_user, get_db, add_new_user
from auth import create_access_token, verify_token


# --------------------------------------------------
# App setup
# --------------------------------------------------

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    token = credentials.credentials
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


# --------------------------------------------------
# WebSocket Connection Manager
# --------------------------------------------------

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, convo_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(convo_id, set()).add(websocket)
        print(f"WS connected | convo={convo_id} | total={len(self.active_connections[convo_id])}")

    def disconnect(self, convo_id: int, websocket: WebSocket):
        conns = self.active_connections.get(convo_id)
        if conns and websocket in conns:
            conns.remove(websocket)
            if not conns:
                self.active_connections.pop(convo_id, None)
        print(f"WS disconnected | convo={convo_id}")

    async def broadcast_to_conversation(self, convo_id: int, payload: dict):
        conns = list(self.active_connections.get(convo_id, []))
        if not conns:
            return

        text = json.dumps(payload)
        await asyncio.gather(
            *(self._safe_send(ws, text) for ws in conns),
            return_exceptions=True,
        )

    async def _safe_send(self, ws: WebSocket, text: str):
        try:
            await ws.send_text(text)
        except Exception:
            pass


manager = ConnectionManager()


# --------------------------------------------------
# WebSocket endpoint
# --------------------------------------------------

@app.websocket("/ws/{convo_id}")
async def websocket_endpoint(websocket: WebSocket, convo_id: int):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    payload = verify_token(token)
    if not payload:
        await websocket.close(code=1008)
        return

    user_id = payload.get("user_id")

    db = SessionLocal()
    try:
        membership = (
            db.query(models.ConversationParticipant)
            .filter(
                models.ConversationParticipant.conversation_id == convo_id,
                models.ConversationParticipant.user_id == user_id,
            )
            .first()
        )
        if not membership:
            await websocket.close(code=1008)
            return
    finally:
        db.close()

    await manager.connect(convo_id, websocket)

    try:
        # Keep connection alive
        while True:
            await asyncio.sleep(60)
    except WebSocketDisconnect:
        manager.disconnect(convo_id, websocket)
    except Exception:
        manager.disconnect(convo_id, websocket)


# --------------------------------------------------
# Auth routes
# --------------------------------------------------

@app.post("/login")
def login(request: UserLogin, db: Session = Depends(get_db)):
    print("inside the login handler python")
    user = authenticate_user(db, request.email, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token({"user_id": user.id})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
    }


@app.post("/signup", response_model=UserOut)
def signup(request: UserSignup, db: Session = Depends(get_db)):
    print("inside the signup python")
    return add_new_user(db, request)


@app.get("/me")
def read_me(current_user: dict = Depends(get_current_user)):
    return {"user_id": current_user["user_id"]}


# --------------------------------------------------
# Conversations & messages
# --------------------------------------------------

@app.get("/conversations", response_model=List[ConversationListItem])
def get_conversations(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]

    conversations = (
        db.query(models.Conversation)
        .join(models.ConversationParticipant)
        .filter(models.ConversationParticipant.user_id == user_id)
        .all()
    )

    result = []

    for c in conversations:
        display_name = None

        if not c.is_group:
            for cp in c.participants:
                if cp.user_id != user_id:
                    user = cp.user or db.query(models.User).get(cp.user_id)
                    display_name = user.name or user.email
                    break
        else:
            display_name = c.title or f"Group {c.id}"

        last_msg = (
            db.query(models.Message)
            .filter(models.Message.conversation_id == c.id)
            .order_by(desc(models.Message.created_at))
            .first()
        )

        result.append(
            ConversationListItem(
                conversation_id=c.id,
                is_group=c.is_group,
                title=c.title,
                display_name=display_name,
                last_message=last_msg.content if last_msg else None,
                last_message_at=last_msg.created_at if last_msg else None,
            )
        )

    return result


@app.get("/conversations/{convo_id}/messages", response_model=List[MessageOut])
def get_messages(
    convo_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]

    membership = (
        db.query(models.ConversationParticipant)
        .filter_by(conversation_id=convo_id, user_id=user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404)

    messages = (
    db.query(models.Message)
    .filter(models.Message.conversation_id == convo_id)
    .order_by(models.Message.created_at)
    .all()
)

    return [
        MessageOut(
            id=m.id,
            conversation_id=m.conversation_id,
            sender_id=m.sender_id,
            sender_name=m.sender.name,   # 👈 ADD THIS
            content=m.content,
            created_at=m.created_at,
            status=m.status,
        )
        for m in messages
    ]



@app.post(
    "/conversations/{convo_id}/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
)
async def post_message(
    convo_id: int,
    payload: SendMessageIn,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]

    membership = (
        db.query(models.ConversationParticipant)
        .filter_by(conversation_id=convo_id, user_id=user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404)

    msg = models.Message(
        conversation_id=convo_id,
        sender_id=user_id,
        content=payload.content,
        created_at=datetime.utcnow(),
        status="sent",
    )

    db.add(msg)
    db.commit()
    db.refresh(msg)

    await manager.broadcast_to_conversation(
        convo_id,
        {
            "type": "message_created",
            "message": {
                "id": msg.id,
                "conversation_id": msg.conversation_id,
                "sender_id": msg.sender_id,
                "sender_name": msg.sender.name,
                "content": msg.content,
                "created_at": msg.created_at.isoformat(),
                "status": msg.status,
            },
        },
    )

    return MessageOut(
    id=msg.id,
    conversation_id=msg.conversation_id,
    sender_id=msg.sender_id,
    sender_name=msg.sender.name,  
    content=msg.content,
    created_at=msg.created_at,
    status=msg.status,
    )



# --------------------------------------------------
# User search & start conversation
# --------------------------------------------------

@app.get("/users")
def search_users(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = db.query(models.User)
    if search:
        like = f"%{search.lower()}%"
        q = q.filter(
            models.User.name.ilike(like) | models.User.email.ilike(like)
        )
    users = q.limit(50).all()
    return [{"id": u.id, "name": u.name, "email": u.email} for u in users]


@app.post("/conversations/start", response_model=ConversationListItem)
def start_conversation(
    payload: Start1to1In,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    me = current_user["user_id"]
    other = payload.other_user_id

    if me == other:
        raise HTTPException(status_code=400)

    cp1 = aliased(models.ConversationParticipant)
    cp2 = aliased(models.ConversationParticipant)

    conv = (
        db.query(models.Conversation)
        .join(cp1, cp1.conversation_id == models.Conversation.id)
        .join(cp2, cp2.conversation_id == models.Conversation.id)
        .filter(models.Conversation.is_group == False)
        .filter(cp1.user_id == me)
        .filter(cp2.user_id == other)
        .first()
    )

    if not conv:
        conv = models.Conversation(is_group=False, created_by=me)
        db.add(conv)
        db.flush()
        db.add_all([
            models.ConversationParticipant(conversation_id=conv.id, user_id=me),
            models.ConversationParticipant(conversation_id=conv.id, user_id=other),
        ])
        db.commit()
        db.refresh(conv)

    other_user = next(
        cp.user for cp in conv.participants if cp.user_id != me
    )

    return ConversationListItem(
        conversation_id=conv.id,
        is_group=False,
        title=None,
        display_name=other_user.name or other_user.email,
        last_message=None,
        last_message_at=None,
    )




@app.post("/conversations/group", response_model=ConversationListItem)
def create_group(
    payload: CreateGroupIn,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    me = current_user["user_id"]

    if not payload.user_ids:
        raise HTTPException(status_code=400, detail="Group must have users")

    conv = models.Conversation(
        is_group=True,
        title=payload.title,
        created_by=me,
    )
    db.add(conv)
    db.flush()

    participants = set(payload.user_ids)
    participants.add(me)

    for uid in participants:
        db.add(
            models.ConversationParticipant(
                conversation_id=conv.id,
                user_id=uid,
                role="admin" if uid == me else "member",
            )
        )

    db.commit()
    db.refresh(conv)

    return ConversationListItem(
        conversation_id=conv.id,
        is_group=True,
        title=conv.title,
        display_name=conv.title,
        last_message=None,
        last_message_at=None,
    )


@app.post("/conversations/{convo_id}/add-users")
def add_users_to_group(
    convo_id: int,
    user_ids: List[int] = Body(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    me = current_user["user_id"]

    conv = db.query(models.Conversation).get(convo_id)
    if not conv or not conv.is_group:
        raise HTTPException(status_code=404)

    admin = (
        db.query(models.ConversationParticipant)
        .filter_by(
            conversation_id=convo_id,
            user_id=me,
            role="admin",
        )
        .first()
    )
    if not admin:
        raise HTTPException(status_code=403)

    existing = {
        cp.user_id for cp in conv.participants
    }

    for uid in user_ids:
        if uid not in existing:
            db.add(
                models.ConversationParticipant(
                    conversation_id=convo_id,
                    user_id=uid,
                )
            )

    db.commit()
    return {"status": "ok"}


@app.get("/conversations/{convo_id}/participants")
def get_conversation_participants(
    convo_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]

    membership = (
        db.query(models.ConversationParticipant)
        .filter_by(conversation_id=convo_id, user_id=user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404)

    participants = (
        db.query(models.ConversationParticipant)
        .join(models.User)
        .filter(models.ConversationParticipant.conversation_id == convo_id)
        .all()
    )

    return [
        {
            "id": p.user.id,
            "name": p.user.name,
            "email": p.user.email,
            "role": p.role,
        }
        for p in participants
    ]


