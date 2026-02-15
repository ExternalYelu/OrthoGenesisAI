from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Float, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def utcnow() -> datetime:
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default="doctor")
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    cases: Mapped[list["Case"]] = relationship(back_populates="owner")


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255))
    patient_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="uploaded")
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    owner: Mapped[User] = relationship(back_populates="cases")
    xrays: Mapped[list["XRayImage"]] = relationship(back_populates="case")
    reconstructions: Mapped[list["Reconstruction"]] = relationship(back_populates="case")


class XRayImage(Base):
    __tablename__ = "xrays"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"))
    view: Mapped[str] = mapped_column(String(50))
    file_key: Mapped[str] = mapped_column(String(512))
    quality_score: Mapped[float] = mapped_column(Float, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    case: Mapped[Case] = relationship(back_populates="xrays")


class Reconstruction(Base):
    __tablename__ = "reconstructions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"))
    status: Mapped[str] = mapped_column(String(50), default="pending")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    mesh_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    version: Mapped[int] = mapped_column(default=1)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    case: Mapped[Case] = relationship(back_populates="reconstructions")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(255))
    resource: Mapped[str] = mapped_column(String(255))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ShareLink(Base):
    __tablename__ = "share_links"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"))
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    
