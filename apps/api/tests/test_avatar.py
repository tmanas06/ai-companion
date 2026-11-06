import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.core.database import get_async_session
from app.core.security import get_current_user
from app.main import app
from app.models import Avatar, User
from app.schemas.avatar import (
    Avatar3DConfigSchema,
    AvatarConfig,
    AvatarCreate,
    AvatarUpdate,
    FaceMorphParametersSchema,
    MaterialParametersSchema,
    HairConfigurationSchema,
    BodyParametersSchema,
    ClothingConfigurationSchema,
)
from app.services.avatar import AvatarService


# -------------------------------------------------------------------------
# 1. Pydantic Schema Validation Tests
# -------------------------------------------------------------------------

def test_avatar_3d_config_defaults():
    """Verify that Avatar3DConfig initializes with valid defaults."""
    config = Avatar3DConfigSchema()
    assert config.version == 2
    assert config.base_model_id == "aria_photorealistic"
    assert config.face.jaw_width == 0.5
    assert config.materials.skin_tone == "#E8B590"
    assert config.hair.asset_id == "ponytail01"
    assert config.body.height == 1.0
    assert config.clothing.outfit_preset_id == "female_elegantsuit01"


def test_avatar_3d_config_camel_case_input():
    """Verify that camelCase frontend payloads are accepted and mapped properly."""
    payload = {
        "version": 2,
        "baseModelId": "marcus_photorealistic",
        "face": {
            "jawWidth": 0.85,
            "chinLength": 0.35,
            "cheekboneHeight": 0.75,
            "eyeSize": 0.6,
            "eyeSpacing": 0.5,
            "noseLength": 0.45,
            "noseBridgeWidth": 0.55,
            "lipFullnessUpper": 0.4,
            "lipFullnessLower": 0.6,
            "mouthWidth": 0.52,
        },
        "materials": {
            "skinTone": "#C68A5C",
            "skinRoughness": 0.5,
            "eyeColor": "#2B5E3B",
        },
        "hair": {
            "assetId": "short02",
            "color": "#1A1A1A",
        },
        "body": {
            "height": 1.05,
            "muscle": 0.7,
            "weight": 0.45,
        },
        "clothing": {
            "outfitPresetId": "male_casualsuit01",
        },
    }
    config = Avatar3DConfigSchema.model_validate(payload)
    assert config.base_model_id == "marcus_photorealistic"
    assert config.face.jaw_width == 0.85
    assert config.face.chin_length == 0.35
    assert config.materials.skin_tone == "#C68A5C"
    assert config.hair.asset_id == "short02"
    assert config.body.height == 1.05


def test_avatar_3d_config_rejects_invalid_morph_bounds():
    """Verify that morph parameters outside 0.0 - 1.0 are rejected."""
    with pytest.raises(ValidationError) as exc_info:
        FaceMorphParametersSchema(jaw_width=1.5)
    assert "less_than_equal" in str(exc_info.value)

    with pytest.raises(ValidationError) as exc_info:
        FaceMorphParametersSchema(chin_length=-0.1)
    assert "greater_than_equal" in str(exc_info.value)


def test_avatar_3d_config_rejects_invalid_body_height():
    """Verify that body height outside 0.85 - 1.15 is rejected."""
    with pytest.raises(ValidationError) as exc_info:
        BodyParametersSchema(height=0.5)
    assert "greater_than_equal" in str(exc_info.value)

    with pytest.raises(ValidationError) as exc_info:
        BodyParametersSchema(height=1.5)
    assert "less_than_equal" in str(exc_info.value)


def test_avatar_3d_config_rejects_invalid_hex_colors():
    """Verify that non-hex color codes are rejected."""
    with pytest.raises(ValidationError) as exc_info:
        MaterialParametersSchema(skin_tone="not-a-color")
    assert "string_pattern_mismatch" in str(exc_info.value)

    with pytest.raises(ValidationError) as exc_info:
        MaterialParametersSchema(eye_color="#12345")  # only 5 digits
    assert "string_pattern_mismatch" in str(exc_info.value)


def test_avatar_3d_config_rejects_unknown_asset_ids_and_paths():
    """Verify that arbitrary paths, URLs, or unregistered asset IDs are rejected."""
    # Path traversal attack attempt
    with pytest.raises(ValidationError) as exc_info:
        HairConfigurationSchema(asset_id="../../etc/passwd")  # type: ignore
    assert "literal_error" in str(exc_info.value)

    # Remote URL injection attempt
    with pytest.raises(ValidationError) as exc_info:
        ClothingConfigurationSchema(outfit_preset_id="https://malicious.com/exploit.glb")  # type: ignore
    assert "literal_error" in str(exc_info.value)


def test_avatar_create_supports_discriminated_union():
    """Verify that AvatarCreate accepts both v1 (2D) and v2 (3D) configurations."""
    # V2 3D Configuration
    v2_payload = {
        "name": "Aria 3D",
        "config": {
            "version": 2,
            "base_model_id": "aria_photorealistic",
            "face": {
                "jaw_width": 0.5,
                "chin_length": 0.5,
                "cheekbone_height": 0.5,
                "eye_size": 0.5,
                "eye_spacing": 0.5,
                "nose_length": 0.5,
                "nose_bridge_width": 0.5,
                "lip_fullness_upper": 0.5,
                "lip_fullness_lower": 0.5,
                "mouth_width": 0.5,
            },
            "materials": {"skin_tone": "#E8B590", "eye_color": "#3B2219"},
            "hair": {"asset_id": "ponytail01", "color": "#2C1B14"},
            "body": {"height": 1.0, "muscle": 0.5, "weight": 0.5},
            "clothing": {"outfit_preset_id": "female_elegantsuit01"},
        },
    }
    created_v2 = AvatarCreate.model_validate(v2_payload)
    assert created_v2.name == "Aria 3D"
    assert created_v2.config.version == 2

    # V1 Legacy 2D Configuration
    v1_payload = {
        "name": "Legacy 2D",
        "config": {
            "version": 1,
            "layers": [
                {"type": "skin", "variant": "default", "color": "#E8B590", "z_index": 0, "visible": True}
            ],
        },
    }
    created_v1 = AvatarCreate.model_validate(v1_payload)
    assert created_v1.name == "Legacy 2D"
    assert created_v1.config.version == 1


# -------------------------------------------------------------------------
# 2. Database Service CRUD & Per-User Isolation Tests
# -------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_avatar_service_crud_and_tenant_isolation():
    """Verify AvatarService CRUD operations and strict tenant isolation."""
    async with get_async_session() as session:
        # Create two isolated test users
        user_a = User(email=f"avatar_user_a_{uuid.uuid4()}@example.com", is_active=True)
        user_b = User(email=f"avatar_user_b_{uuid.uuid4()}@example.com", is_active=True)
        session.add(user_a)
        session.add(user_b)
        await session.commit()
        await session.refresh(user_a)
        await session.refresh(user_b)

        service = AvatarService(session)

        # 1. User A creates a 3D Avatar
        create_data = AvatarCreate(
            name="Aria Studio 1",
            config=Avatar3DConfigSchema(
                base_model_id="aria_photorealistic",
                face=FaceMorphParametersSchema(jaw_width=0.6, chin_length=0.4),
                materials=MaterialParametersSchema(skin_tone="#F2C5A0", eye_color="#2B5E3B"),
            ),
        )
        avatar_a = await service.create_avatar(user_a.id, create_data)
        assert avatar_a.id is not None
        assert avatar_a.user_id == user_a.id
        assert avatar_a.config_version == 2
        assert avatar_a.config["face"]["jawWidth"] == 0.6
        assert avatar_a.is_active is True

        # 2. User A retrieves active avatar
        active_a = await service.get_active_avatar(user_a.id)
        assert active_a is not None
        assert active_a.id == avatar_a.id

        # 3. Tenant Isolation: User B cannot see or get User A's avatar
        avatars_b, total_b = await service.list_avatars(user_b.id)
        assert total_b == 0
        assert not any(a.id == avatar_a.id for a in avatars_b)

        get_by_b = await service.get_avatar(user_b.id, avatar_a.id)
        assert get_by_b is None

        # 4. Tenant Isolation: User B cannot update or delete User A's avatar
        update_by_b = await service.update_avatar(
            user_b.id,
            avatar_a.id,
            AvatarUpdate(name="Hacked Name"),
        )
        assert update_by_b is None

        delete_by_b = await service.delete_avatar(user_b.id, avatar_a.id)
        assert delete_by_b is False

        # 5. User A creates a second avatar (should automatically become active, deactivating avatar 1)
        create_data_2 = AvatarCreate(
            name="Aria Studio 2",
            config=Avatar3DConfigSchema(
                base_model_id="aria_photorealistic",
                face=FaceMorphParametersSchema(jaw_width=0.3),
            ),
        )
        avatar_a_2 = await service.create_avatar(user_a.id, create_data_2)
        assert avatar_a_2.is_active is True

        # Refresh avatar 1 and check that it was deactivated
        refreshed_1 = await service.get_avatar(user_a.id, avatar_a.id)
        assert refreshed_1 is not None
        assert refreshed_1.is_active is False

        # 6. User A re-activates avatar 1
        activated = await service.set_active_avatar(user_a.id, avatar_a.id)
        assert activated is not None
        assert activated.id == avatar_a.id
        assert activated.is_active is True

        refreshed_2 = await service.get_avatar(user_a.id, avatar_a_2.id)
        assert refreshed_2 is not None
        assert refreshed_2.is_active is False

        # 7. User A updates avatar 1 configuration
        updated_1 = await service.update_avatar(
            user_a.id,
            avatar_a.id,
            AvatarUpdate(
                name="Aria Custom Edition",
                config=Avatar3DConfigSchema(
                    base_model_id="aria_photorealistic",
                    face=FaceMorphParametersSchema(jaw_width=0.75),
                ),
            ),
        )
        assert updated_1 is not None
        assert updated_1.name == "Aria Custom Edition"
        assert updated_1.config["face"]["jawWidth"] == 0.75

        # 8. User A deletes active avatar 1 -> avatar 2 becomes active automatically
        deleted = await service.delete_avatar(user_a.id, avatar_a.id)
        assert deleted is True
        assert await service.get_avatar(user_a.id, avatar_a.id) is None

        new_active = await service.get_active_avatar(user_a.id)
        assert new_active is not None
        assert new_active.id == avatar_a_2.id


# -------------------------------------------------------------------------
# 3. HTTP API Endpoints & Authorization Tests
# -------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_avatar_api_authentication_required():
    """Verify that unauthenticated requests to avatar endpoints are rejected."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/avatars")
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_avatar_api_crud_flow():
    """Verify complete HTTP API flow for /api/v1/avatars with authenticated user."""
    async with get_async_session() as session:
        user = User(email=f"api_avatar_user_{uuid.uuid4()}@example.com", is_active=True)
        session.add(user)
        await session.commit()
        await session.refresh(user)

    app.dependency_overrides[get_current_user] = lambda: user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Create a 3D avatar via POST
            create_payload = {
                "name": "My Aria Companion",
                "config": {
                    "version": 2,
                    "baseModelId": "aria_photorealistic",
                    "face": {
                        "jawWidth": 0.65,
                        "chinLength": 0.45,
                        "cheekboneHeight": 0.7,
                        "eyeSize": 0.55,
                        "eyeSpacing": 0.5,
                        "noseLength": 0.5,
                        "noseBridgeWidth": 0.5,
                        "lipFullnessUpper": 0.6,
                        "lipFullnessLower": 0.65,
                        "mouthWidth": 0.5,
                    },
                    "materials": {
                        "skinTone": "#E8B590",
                        "eyeColor": "#3B2219",
                    },
                    "hair": {
                        "assetId": "ponytail01",
                        "color": "#2C1B14",
                    },
                    "body": {
                        "height": 1.0,
                        "muscle": 0.5,
                        "weight": 0.5,
                    },
                    "clothing": {
                        "outfitPresetId": "female_elegantsuit01",
                    },
                },
            }
            create_res = await client.post("/api/v1/avatars", json=create_payload)
            assert create_res.status_code == 201, create_res.text
            avatar_data = create_res.json()
            assert avatar_data["name"] == "My Aria Companion"
            assert avatar_data["config_version"] == 2
            assert avatar_data["is_active"] is True
            avatar_id = avatar_data["id"]

            # 2. Get active avatar via GET /active
            active_res = await client.get("/api/v1/avatars/active")
            assert active_res.status_code == 200
            assert active_res.json()["id"] == avatar_id

            # 3. List avatars via GET
            list_res = await client.get("/api/v1/avatars")
            assert list_res.status_code == 200
            list_data = list_res.json()
            assert list_data["total"] >= 1
            assert any(a["id"] == avatar_id for a in list_data["avatars"])

            # 4. Get by ID
            get_res = await client.get(f"/api/v1/avatars/{avatar_id}")
            assert get_res.status_code == 200
            assert get_res.json()["name"] == "My Aria Companion"

            # 5. Patch avatar configuration
            patch_payload = {
                "name": "Updated Aria Companion",
                "config": {
                    "version": 2,
                    "baseModelId": "aria_photorealistic",
                    "face": {
                        "jawWidth": 0.8,
                        "chinLength": 0.5,
                        "cheekboneHeight": 0.7,
                        "eyeSize": 0.5,
                        "eyeSpacing": 0.5,
                        "noseLength": 0.5,
                        "noseBridgeWidth": 0.5,
                        "lipFullnessUpper": 0.5,
                        "lipFullnessLower": 0.5,
                        "mouthWidth": 0.5,
                    },
                    "materials": {
                        "skinTone": "#F2C5A0",
                        "eyeColor": "#2B5E3B",
                    },
                    "hair": {
                        "assetId": "bob01",
                        "color": "#4A2E18",
                    },
                    "body": {
                        "height": 1.02,
                        "muscle": 0.6,
                        "weight": 0.5,
                    },
                    "clothing": {
                        "outfitPresetId": "smart_blazer",
                    },
                },
            }
            patch_res = await client.patch(f"/api/v1/avatars/{avatar_id}", json=patch_payload)
            assert patch_res.status_code == 200
            updated_json = patch_res.json()
            assert updated_json["name"] == "Updated Aria Companion"
            assert updated_json["config"]["hair"]["assetId"] == "bob01"
            assert updated_json["config"]["materials"]["skinTone"] == "#F2C5A0"

            # 6. Reject invalid patch (e.g. invalid morph parameter)
            bad_patch = {
                "config": {
                    "version": 2,
                    "face": {"jawWidth": 99.9},  # invalid > 1.0
                }
            }
            bad_res = await client.patch(f"/api/v1/avatars/{avatar_id}", json=bad_patch)
            assert bad_res.status_code == 422

            # 7. Delete avatar
            del_res = await client.delete(f"/api/v1/avatars/{avatar_id}")
            assert del_res.status_code == 204

            # 8. Verify 404 after deletion
            get_del_res = await client.get(f"/api/v1/avatars/{avatar_id}")
            assert get_del_res.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
