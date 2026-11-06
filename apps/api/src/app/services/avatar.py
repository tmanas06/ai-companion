from datetime import UTC, datetime
from typing import Optional, List
from uuid import UUID
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Avatar, AvatarAsset, User
from app.schemas.avatar import AvatarCreate, AvatarUpdate, AvatarConfig


class AvatarService:
    """Service for managing avatar configurations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_avatar(self, user_id: UUID, data: AvatarCreate) -> "Avatar":
        """Create a new avatar configuration."""
        # If this is set as active, deactivate other avatars
        if data.config is not None:  # AvatarCreate always has config
            pass

        avatar = Avatar(
            user_id=user_id,
            name=data.name,
            config_version=data.config.version if data.config else 1,
            config=data.config.model_dump() if data.config else {"version": 1, "layers": []},
            is_active=True,
        )
        self.session.add(avatar)

        # If this is the first avatar or explicitly set active, deactivate others
        result = await self.session.execute(
            select(Avatar).where(Avatar.user_id == user_id, Avatar.id != avatar.id)
        )
        other_avatars = result.scalars().all()
        for other in other_avatars:
            other.is_active = False

        await self.session.commit()
        await self.session.refresh(avatar)
        return avatar

    async def get_avatar(self, user_id: UUID, avatar_id: UUID) -> Optional["Avatar"]:
        """Get an avatar by ID, ensuring ownership."""
        result = await self.session.execute(
            select(Avatar)
            .where(Avatar.id == avatar_id)
            .where(Avatar.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_active_avatar(self, user_id: UUID) -> Optional["Avatar"]:
        """Get the user's active avatar."""
        result = await self.session.execute(
            select(Avatar)
            .where(Avatar.user_id == user_id)
            .where(Avatar.is_active.is_(True))
        )
        return result.scalar_one_or_none()

    async def list_avatars(
        self, user_id: UUID, page: int = 1, page_size: int = 20
    ) -> tuple[List["Avatar"], int]:
        """List avatars for a user with pagination."""
        # Count total
        count_result = await self.session.execute(
            select(func.count(Avatar.id)).where(Avatar.user_id == user_id)
        )
        total = count_result.scalar() or 0

        # Get paginated results
        result = await self.session.execute(
            select(Avatar)
            .where(Avatar.user_id == user_id)
            .order_by(desc(Avatar.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        avatars = result.scalars().all()
        return list(avatars), total

    async def update_avatar(
        self, user_id: UUID, avatar_id: UUID, data: AvatarUpdate
    ) -> Optional["Avatar"]:
        """Update an avatar."""
        avatar = await self.get_avatar(user_id, avatar_id)
        if not avatar:
            return None

        if data.name is not None:
            avatar.name = data.name
        if data.config is not None:
            avatar.config = data.config.model_dump()
            avatar.config_version = data.config.version
        if data.is_active is not None:
            if data.is_active:
                # Deactivate other avatars
                result = await self.session.execute(
                    select(Avatar).where(Avatar.user_id == user_id, Avatar.id != avatar_id)
                )
                other_avatars = result.scalars().all()
                for other in other_avatars:
                    other.is_active = False
            avatar.is_active = data.is_active

        avatar.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(avatar)
        return avatar

    async def delete_avatar(self, user_id: UUID, avatar_id: UUID) -> bool:
        """Delete an avatar."""
        avatar = await self.get_avatar(user_id, avatar_id)
        if not avatar:
            return False

        was_active = avatar.is_active
        await self.session.delete(avatar)
        await self.session.commit()

        # If deleted avatar was active, activate the most recent other avatar
        if was_active:
            result = await self.session.execute(
                select(Avatar)
                .where(Avatar.user_id == user_id)
                .order_by(desc(Avatar.created_at))
                .limit(1)
            )
            other = result.scalar_one_or_none()
            if other:
                other.is_active = True
                await self.session.commit()

        return True

    async def set_active_avatar(self, user_id: UUID, avatar_id: UUID) -> Optional["Avatar"]:
        """Set an avatar as the active one."""
        avatar = await self.get_avatar(user_id, avatar_id)
        if not avatar:
            return None

        # Deactivate all other avatars
        result = await self.session.execute(
            select(Avatar).where(Avatar.user_id == user_id, Avatar.id != avatar_id)
        )
        other_avatars = result.scalars().all()
        for other in other_avatars:
            other.is_active = False

        avatar.is_active = True
        avatar.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(avatar)
        return avatar

    # Avatar Asset management
    async def create_asset(self, data: "AvatarAssetCreate") -> "AvatarAsset":
        """Create a new avatar asset."""
        asset = AvatarAsset(
            layer_type=data.layer_type,
            variant=data.variant,
            asset_url=data.asset_url,
            metadata=data.metadata or {},
        )
        self.session.add(asset)
        await self.session.commit()
        await self.session.refresh(asset)
        return asset

    async def get_asset(self, asset_id: UUID) -> Optional["AvatarAsset"]:
        """Get an asset by ID."""
        result = await self.session.execute(
            select(AvatarAsset).where(AvatarAsset.id == asset_id)
        )
        return result.scalar_one_or_none()

    async def get_assets_by_layer(self, layer_type: str) -> List["AvatarAsset"]:
        """Get all assets for a layer type."""
        result = await self.session.execute(
            select(AvatarAsset).where(AvatarAsset.layer_type == layer_type)
        )
        return list(result.scalars().all())

    async def list_assets(
        self, layer_type: Optional[str] = None, page: int = 1, page_size: int = 50
    ) -> tuple[List["AvatarAsset"], int]:
        """List avatar assets with pagination."""
        query = select(AvatarAsset)
        if layer_type:
            query = query.where(AvatarAsset.layer_type == layer_type)

        # Count total
        count_query = select(func.count(AvatarAsset.id)).select_from(query.subquery())
        count_result = await self.session.execute(count_query)
        total = count_result.scalar() or 0

        # Get paginated results
        query = query.order_by(AvatarAsset.layer_type, AvatarAsset.variant).offset((page - 1) * page_size).limit(page_size)
        result = await self.session.execute(query)
        assets = result.scalars().all()
        return list(assets), total


async def get_avatar_service(session) -> "AvatarService":
    """Dependency for getting avatar service."""
    return AvatarService(session)