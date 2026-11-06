import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import get_async_session
from app.core.security import get_current_user
from app.main import app
from app.models import Companion, User
from app.schemas.companion import CompanionCreate, CompanionUpdate
from app.services.companion import CompanionService, build_companion_system_prompt


@pytest.mark.asyncio
async def test_build_companion_system_prompt():
    """Verify system prompt building from name, bio, and personality traits."""
    prompt = build_companion_system_prompt(
        name="Seraphina",
        personality={
            "bio": "An empathetic stargazer who enjoys reading philosophy.",
            "traits": ["Caring", "Intelligent", "Playful"],
            "style": "anime",
        },
    )
    assert "You are Seraphina" in prompt
    assert "stargazer who enjoys reading philosophy" in prompt
    assert "Caring, Intelligent, Playful" in prompt
    assert "Avatar Style: anime" in prompt


@pytest.mark.asyncio
async def test_companion_service_crud_and_isolation():
    """Verify companion creation, listing, updating, and strict tenant isolation."""
    async with get_async_session() as session:
        # Create two distinct test users
        user_a = User(email=f"user_comp_a_{uuid.uuid4()}@example.com", is_active=True)
        user_b = User(email=f"user_comp_b_{uuid.uuid4()}@example.com", is_active=True)
        session.add(user_a)
        session.add(user_b)
        await session.commit()
        await session.refresh(user_a)
        await session.refresh(user_b)

        service = CompanionService(session)

        # 1. User A creates companion
        data_a = CompanionCreate(
            name="Aria",
            personality={
                "bio": "A creative companion.",
                "traits": ["Caring", "Adventurous"],
                "style": "illustrated",
            },
            llm_config={"provider": "ollama", "model": "qwen3:8b"},
        )
        comp_a = await service.create_companion(user_a.id, data_a)
        assert comp_a.id is not None
        assert comp_a.user_id == user_a.id
        assert comp_a.name == "Aria"
        assert "Caring, Adventurous" in comp_a.system_prompt
        assert comp_a.personality["style"] == "illustrated"

        # 2. List companions for User A
        comps, total = await service.list_companions(user_a.id)
        assert total >= 1
        assert any(c.id == comp_a.id for c in comps)

        # 3. Tenant isolation: User B cannot see or get User A's companion
        comps_b, total_b = await service.list_companions(user_b.id)
        assert not any(c.id == comp_a.id for c in comps_b)

        get_by_b = await service.get_companion(user_b.id, comp_a.id)
        assert get_by_b is None

        # 4. User A updates companion personality traits
        update_data = CompanionUpdate(
            name="Aria Solar",
            personality={
                "bio": "A creative solar explorer.",
                "traits": ["Caring", "Adventurous", "Humorous"],
                "style": "illustrated",
            },
        )
        updated = await service.update_companion(user_a.id, comp_a.id, update_data)
        assert updated is not None
        assert updated.name == "Aria Solar"
        assert "Humorous" in updated.system_prompt

        # 5. User B cannot delete User A's companion
        delete_by_b = await service.delete_companion(user_b.id, comp_a.id)
        assert delete_by_b is False

        # 6. User A deletes companion
        delete_by_a = await service.delete_companion(user_a.id, comp_a.id)
        assert delete_by_a is True

        # Verify companion is gone
        assert await service.get_companion(user_a.id, comp_a.id) is None


@pytest.mark.asyncio
async def test_companion_api_endpoints():
    """Verify HTTP API endpoints for /api/v1/companions."""
    async with get_async_session() as session:
        user = User(email=f"api_comp_{uuid.uuid4()}@example.com", is_active=True)
        session.add(user)
        await session.commit()
        await session.refresh(user)

    app.dependency_overrides[get_current_user] = lambda: user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Create companion via POST
            create_payload = {
                "name": "Nova",
                "personality": {
                    "traits": ["Intelligent", "Calm"],
                    "style": "3d",
                    "bio": "A 3D holographic guide.",
                },
                "llm_config": {"provider": "ollama"},
            }
            res = await client.post("/api/v1/companions", json=create_payload)
            assert res.status_code == 201, res.text
            comp_data = res.json()
            assert comp_data["name"] == "Nova"
            assert comp_data["user_id"] == str(user.id)
            comp_id = comp_data["id"]

            # 2. List companions via GET
            list_res = await client.get("/api/v1/companions")
            assert list_res.status_code == 200
            list_json = list_res.json()
            assert list_json["total"] >= 1
            assert any(c["id"] == comp_id for c in list_json["companions"])

            # 3. Get companion by ID
            get_res = await client.get(f"/api/v1/companions/{comp_id}")
            assert get_res.status_code == 200
            assert get_res.json()["name"] == "Nova"

            # 4. Patch companion
            patch_res = await client.patch(
                f"/api/v1/companions/{comp_id}",
                json={"name": "Nova Prime"},
            )
            assert patch_res.status_code == 200
            assert patch_res.json()["name"] == "Nova Prime"

            # 5. Delete companion
            del_res = await client.delete(f"/api/v1/companions/{comp_id}")
            assert del_res.status_code == 204

            # 6. Verify 404 after deletion
            get_del_res = await client.get(f"/api/v1/companions/{comp_id}")
            assert get_del_res.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
