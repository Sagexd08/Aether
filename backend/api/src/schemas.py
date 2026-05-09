from pydantic import BaseModel, EmailStr


class SignUpRequest(BaseModel):
    email: EmailStr
    name: str
    password: str


class SignInRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    name: str
    credits_remaining: int


class AuthResponse(BaseModel):
    access_token: str
    user: UserResponse


class GenerateRequest(BaseModel):
    mode: str
    prompt: str
    enhance: bool = False
    model: str | None = None


class GenerationResponse(BaseModel):
    id: str
    status: str
