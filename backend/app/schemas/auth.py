from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AuthConfigOut(BaseModel):
    demo_mode: bool
    platform_demo: bool


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class MessageOut(BaseModel):
    message: str


class TokenInfoOut(BaseModel):
    purpose: str
    email: str
    full_name: str


class SetPasswordRequest(BaseModel):
    token: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
