from datetime import UTC, datetime
from typing import Optional, List, Tuple
from uuid import UUID
from fastapi import Depends
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Companion
from app.schemas.companion import CompanionCreate, CompanionUpdate


def build_companion_system_prompt(
    name: str,
    personality: Optional[dict] = None,
    base_prompt: Optional[str] = None,
) -> str:
    """Build a rich, consistent companion system prompt incorporating personality traits and identity."""
    personality = personality or {}
    bio = personality.get("bio")
    traits = personality.get("traits") or []
    style = personality.get("style")

    sections = []

    if base_prompt and base_prompt.strip():
        sections.append(base_prompt.strip())
    else:
        sections.append(f"You are {name}, a personal AI companion.")

    if bio and isinstance(bio, str) and bio.strip() and bio.strip() not in (base_prompt or ""):
        sections.append(f"Background:\n{bio.strip()}")

    if traits and isinstance(traits, list):
        trait_names = [t.strip() for t in traits if isinstance(t, str) and t.strip()]
        if trait_names and not any(t in (base_prompt or "") for t in trait_names):
            trait_str = ", ".join(trait_names)
            sections.append(
                f"Core Personality Traits: {trait_str}.\n"
                f"Express these traits naturally through your conversational tone, perspective, and pacing. "
                f"Remain authentic, attentive, and responsive to the user without exaggerating or roleplaying unnaturally."
            )

    if style and isinstance(style, str) and style.strip():
        if f"Avatar Style: {style}" not in (base_prompt or ""):
            sections.append(f"Avatar Style: {style.strip()}.")

    return "\n\n".join(sections).strip()


class CompanionService:
    """Service for managing AI Companions."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_companion(self, user_id: UUID, data: CompanionCreate) -> Companion:
        """Create a new companion for the user."""
        personality = data.personality or {}
        system_prompt = data.system_prompt
        if not system_prompt or not system_prompt.strip():
            system_prompt = build_companion_system_prompt(data.name, personality=personality)
        else:
            system_prompt = build_companion_system_prompt(
                data.name, personality=personality, base_prompt=system_prompt
            )

        now = datetime.now(UTC)
        companion = Companion(
            user_id=user_id,
            name=data.name.strip(),
            system_prompt=system_prompt,
            personality=personality,
            llm_config=data.llm_config or {},
            is_active=data.is_active,
            created_at=now,
            updated_at=now,
        )
        self.session.add(companion)
        await self.session.commit()
        await self.session.refresh(companion)
        return companion

    async def list_companions(
        self,
        user_id: UUID,
        page: int = 1,
        page_size: int = 20,
        active_only: bool = False,
    ) -> Tuple[List[Companion], int]:
        """List companions for the user with pagination."""
        query = select(Companion).where(Companion.user_id == user_id)
        if active_only:
            query = query.where(Companion.is_active == True)

        count_query = select(func.count(Companion.id)).where(Companion.user_id == user_id)
        if active_only:
            count_query = count_query.where(Companion.is_active == True)
        count_res = await self.session.execute(count_query)
        total = count_res.scalar() or 0

        query = query.order_by(desc(Companion.updated_at)).offset((page - 1) * page_size).limit(page_size)
        res = await self.session.execute(query)
        companions = res.scalars().all()
        return list(companions), total

    async def get_companion(self, user_id: UUID, companion_id: UUID) -> Optional[Companion]:
        """Get companion by ID, ensuring ownership."""
        query = select(Companion).where(
            Companion.id == companion_id,
            Companion.user_id == user_id,
        )
        res = await self.session.execute(query)
        return res.scalar_one_or_none()

    async def update_companion(
        self, user_id: UUID, companion_id: UUID, data: CompanionUpdate
    ) -> Optional[Companion]:
        """Update an existing companion."""
        companion = await self.get_companion(user_id, companion_id)
        if not companion:
            return None

        update_dict = data.model_dump(exclude_unset=True)

        if "name" in update_dict and update_dict["name"] is not None:
            companion.name = update_dict["name"].strip()
        if "is_active" in update_dict and update_dict["is_active"] is not None:
            companion.is_active = update_dict["is_active"]
        if "personality" in update_dict and update_dict["personality"] is not None:
            companion.personality = update_dict["personality"]
        if "llm_config" in update_dict and update_dict["llm_config"] is not None:
            companion.llm_config = update_dict["llm_config"]

        if "system_prompt" in update_dict and update_dict["system_prompt"] is not None:
            companion.system_prompt = update_dict["system_prompt"]
        elif "personality" in update_dict or "name" in update_dict:
            # Rebuild prompt incorporating new personality/name
            companion.system_prompt = build_companion_system_prompt(
                companion.name,
                personality=companion.personality,
            )

        companion.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(companion)
        return companion

    async def delete_companion(self, user_id: UUID, companion_id: UUID) -> bool:
        """Delete companion by ID, ensuring ownership."""
        companion = await self.get_companion(user_id, companion_id)
        if not companion:
            return False

        await self.session.delete(companion)
        await self.session.commit()
        return True


async def get_companion_service(session: AsyncSession = Depends(get_db)) -> CompanionService:
    """FastAPI dependency for CompanionService."""
    return CompanionService(session)
