from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class UserLogin(BaseModel):
    email: str
    password: str


class UserSignup(BaseModel):
    name:  str
    email: str
    password: str

class UserOut(BaseModel):
    id: int
    name: Optional[str]
    email: Optional[str]
    class Config:
        orm_mode = True

class ConversationListItem(BaseModel):
    conversation_id: int
    is_group: bool
    title: Optional[str]
    display_name: Optional[str]
    last_message: Optional[str]
    last_message_at: Optional[datetime]
    class Config:
        orm_mode = True

class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    sender_name: Optional[str] 
    content: str
    created_at: Optional[datetime]
    status: Optional[str]
    class Config:
        orm_mode = True

class SendMessageIn(BaseModel):
    content: str

class Start1to1In(BaseModel):
    other_user_id: int

class CreateGroupIn(BaseModel):
    title: str
    user_ids: List[int]  # participants (besides creator)

