import math
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

class Register(BaseModel):
    email: str = Field(min_length=5,max_length=254,pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
    password: str = Field(min_length=10,max_length=128)
    name: str = Field(min_length=2,max_length=100)
    @field_validator('email')
    @classmethod
    def normalize(cls,v): return v.strip().lower()

class Login(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)

class Onboarding(BaseModel):
    name: str = Field(min_length=2,max_length=100)
    farm_name: str = Field(min_length=2,max_length=120)
    language: Literal['ru','kk']='ru'
    region: str = Field(max_length=120,default='')

class Geometry(BaseModel):
    type: Literal['Polygon','MultiPolygon']
    coordinates: list
    @field_validator('coordinates')
    @classmethod
    def valid_coordinates(cls,v):
        count=0
        def visit(x):
            nonlocal count
            if not isinstance(x,list) or not x: raise ValueError('Пустая геометрия')
            if isinstance(x[0],(float,int)):
                if len(x)!=2 or not all(isinstance(a,(float,int)) and not isinstance(a,bool) and math.isfinite(a) for a in x): raise ValueError('Требуются 2D координаты')
                if not (-180<=x[0]<=180 and -90<=x[1]<=90): raise ValueError('Неверные координаты')
                count+=1
            else:
                for a in x: visit(a)
        visit(v)
        if count<4 or count>5000: raise ValueError('Допускается 4–5000 вершин')
        return v

class FieldCreate(BaseModel):
    farm_id: UUID
    name: str = Field(min_length=2,max_length=120)
    crop_id: str | None = Field(default=None,max_length=50)
    geometry: Geometry

class FieldUpdate(BaseModel):
    name: str = Field(min_length=2,max_length=120)
    crop_id: str | None = Field(default=None,max_length=50)
    geometry: Geometry
    revision: int = Field(ge=1)

class ListingInput(BaseModel):
    type: Literal['product','machinery_rental','service','job']
    title: str = Field(min_length=3,max_length=160)
    description: str = Field(min_length=5,max_length=6000)
    price: float = Field(ge=0,le=999999999999,allow_inf_nan=False)
    unit: str = Field(default='₸',max_length=30)
    region: str = Field(min_length=2,max_length=120)
    lat: float | None = Field(default=None,ge=40,le=56,allow_inf_nan=False)
    lon: float | None = Field(default=None,ge=45,le=88,allow_inf_nan=False)

class ConversationInput(BaseModel):
    title: str = Field(default='Личный чат',min_length=2,max_length=100)
    kind: Literal['direct','group']='direct'
    member_ids: list[UUID] = Field(min_length=1,max_length=30)

class MessageInput(BaseModel):
    body: str = Field(min_length=1,max_length=6000)
    client_id: UUID
    reply_to_id: int | None = Field(default=None,ge=1)
    forward_message_id: int | None = Field(default=None,ge=1)
    attachments: list[UUID] = Field(default_factory=list,max_length=6)
    field_id: UUID | None = None
    @field_validator('body')
    @classmethod
    def not_blank(cls,v):
        if not v.strip(): raise ValueError('Пустое сообщение')
        return v.strip()

class ReadInput(BaseModel):
    last_read_id: int = Field(ge=0)

class AssistantInput(BaseModel):
    question: str = Field(min_length=2,max_length=2000)
    field_id: UUID | None = None

class Interest(BaseModel):
    kind: Literal['region','crop','topic']
    value: str = Field(min_length=1,max_length=120)

class InterestsInput(BaseModel):
    interests: list[Interest] = Field(max_length=30)

class MLInput(BaseModel):
    ph: float = Field(ge=0,le=14,allow_inf_nan=False)
    growing_temperature: float = Field(ge=-30,le=50,allow_inf_nan=False)
    growing_precipitation: float = Field(ge=0,le=4000,allow_inf_nan=False)
    clay: float = Field(ge=0,le=100,allow_inf_nan=False)
    soc: float = Field(ge=0,le=600,allow_inf_nan=False)

class RiskInput(BaseModel):
    min_temperature: float = Field(ge=-80,le=60,allow_inf_nan=False)
    max_temperature: float = Field(ge=-80,le=70,allow_inf_nan=False)
    precipitation: float = Field(ge=0,le=3000,allow_inf_nan=False)
    max_wind: float = Field(ge=0,le=500,allow_inf_nan=False)

class MemberInput(BaseModel):
    user_id: UUID
    role: Literal['admin','agronomist','worker','viewer']
