"""
End-to-end multi-user and persistence integration tests for Aria Avatar Studio (Phase 2 & Phase 5).
Uses the real PostgreSQL database and real JWT authentication pipeline.
"""

import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_avatar_e2e_real_multiuser_security_and_persistence():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Register two independent test accounts
        email_a = f"e2e_user_a_{uuid.uuid4().hex[:8]}@example.com"
        email_b = f"e2e_user_b_{uuid.uuid4().hex[:8]}@example.com"
        password = "SecurePassword123!"

        reg_a = await client.post(
            "/api/v1/auth/register",
            json={"email": email_a, "password": password, "full_name": "User Alpha"},
        )
        assert reg_a.status_code == 201, reg_a.text
        token_a = reg_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        reg_b = await client.post(
            "/api/v1/auth/register",
            json={"email": email_b, "password": password, "full_name": "User Beta"},
        )
        assert reg_b.status_code == 201, reg_b.text
        token_b = reg_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # 2. Verify both users initially have no active avatar (graceful 404)
        init_a = await client.get("/api/v1/avatars/active", headers=headers_a)
        assert init_a.status_code == 404
        assert init_a.json()["detail"] == "No active avatar found"

        init_b = await client.get("/api/v1/avatars/active", headers=headers_b)
        assert init_b.status_code == 404
        assert init_b.json()["detail"] == "No active avatar found"

        # 3. User A creates customized Aria 3D avatar
        payload_a = {
            "name": "Alpha Aria Custom",
            "config": {
                "version": 2,
                "baseModelId": "aria_photorealistic",
                "face": {
                    "jawWidth": 0.85,
                    "chinLength": 0.40,
                    "cheekboneHeight": 0.75,
                    "cheekboneFullness": 0.60,
                    "eyeSize": 0.70,
                    "eyeSpacing": 0.50,
                    "noseLength": 0.50,
                    "noseBridgeWidth": 0.35,
                    "lipFullnessUpper": 0.80,
                    "lipFullnessLower": 0.85,
                    "mouthWidth": 0.65,
                },
                "materials": {
                    "skinTone": "#F5D0B5",
                    "skinRoughness": 0.55,
                    "eyeColor": "#2A4B7C",
                    "eyeRoughness": 0.05,
                },
                "hair": {
                    "assetId": "bob01",
                    "color": "#B59A57",
                    "roughness": 0.75,
                },
                "body": {
                    "height": 1.08,
                    "muscle": 0.50,
                    "weight": 0.50,
                },
                "clothing": {
                    "outfitPresetId": "female_elegantsuit01",
                    "topColor": "#4A1521",
                },
            },
        }

        create_a = await client.post("/api/v1/avatars", headers=headers_a, json=payload_a)
        assert create_a.status_code == 201, create_a.text
        data_a = create_a.json()
        avatar_a_id = data_a["id"]
        assert data_a["name"] == "Alpha Aria Custom"
        assert data_a["is_active"] is True
        assert data_a["config"]["face"]["jawWidth"] == 0.85
        assert data_a["config"]["materials"]["skinTone"] == "#F5D0B5"

        # 4. User B creates customized Marcus 3D avatar
        payload_b = {
            "name": "Beta Marcus Custom",
            "config": {
                "version": 2,
                "baseModelId": "marcus_photorealistic",
                "face": {
                    "jawWidth": 0.30,
                    "chinLength": 0.70,
                    "cheekboneHeight": 0.40,
                    "cheekboneFullness": 0.30,
                    "eyeSize": 0.40,
                    "eyeSpacing": 0.50,
                    "noseLength": 0.50,
                    "noseBridgeWidth": 0.65,
                    "lipFullnessUpper": 0.40,
                    "lipFullnessLower": 0.45,
                    "mouthWidth": 0.40,
                },
                "materials": {
                    "skinTone": "#6E4123",
                    "skinRoughness": 0.60,
                    "eyeColor": "#1A1A1A",
                    "eyeRoughness": 0.10,
                },
                "hair": {
                    "assetId": "short02",
                    "color": "#1A1A1A",
                    "roughness": 0.80,
                },
                "body": {
                    "height": 0.95,
                    "muscle": 0.70,
                    "weight": 0.60,
                },
                "clothing": {
                    "outfitPresetId": "male_casualsuit01",
                    "topColor": "#1C1E24",
                },
            },
        }

        create_b = await client.post("/api/v1/avatars", headers=headers_b, json=payload_b)
        assert create_b.status_code == 201, create_b.text
        data_b = create_b.json()
        avatar_b_id = data_b["id"]
        assert data_b["name"] == "Beta Marcus Custom"
        assert data_b["is_active"] is True
        assert data_b["config"]["face"]["jawWidth"] == 0.30
        assert data_b["config"]["materials"]["skinTone"] == "#6E4123"

        # 5. Persistence & Multi-Tenant Retrieval: Each account retrieves only its own avatar
        get_active_a = await client.get("/api/v1/avatars/active", headers=headers_a)
        assert get_active_a.status_code == 200
        active_a_data = get_active_a.json()
        assert active_a_data["id"] == avatar_a_id
        assert active_a_data["name"] == "Alpha Aria Custom"
        assert active_a_data["config"]["face"]["jawWidth"] == 0.85
        assert active_a_data["config"]["materials"]["skinTone"] == "#F5D0B5"

        get_active_b = await client.get("/api/v1/avatars/active", headers=headers_b)
        assert get_active_b.status_code == 200
        active_b_data = get_active_b.json()
        assert active_b_data["id"] == avatar_b_id
        assert active_b_data["name"] == "Beta Marcus Custom"
        assert active_b_data["config"]["face"]["jawWidth"] == 0.30
        assert active_b_data["config"]["materials"]["skinTone"] == "#6E4123"

        # 6. Strict Tenant Isolation: User A CANNOT access, update, activate, or delete User B's avatar
        cross_get = await client.get(f"/api/v1/avatars/{avatar_b_id}", headers=headers_a)
        assert cross_get.status_code == 404, "Cross-user avatar access should return 404"
        assert cross_get.json()["detail"] == "Avatar not found"

        cross_patch = await client.patch(
            f"/api/v1/avatars/{avatar_b_id}",
            headers=headers_a,
            json={"name": "Hacked Avatar"},
        )
        assert cross_patch.status_code == 404

        cross_activate = await client.post(
            f"/api/v1/avatars/{avatar_b_id}/activate",
            headers=headers_a,
        )
        assert cross_activate.status_code == 404

        cross_delete = await client.delete(
            f"/api/v1/avatars/{avatar_b_id}",
            headers=headers_a,
        )
        assert cross_delete.status_code == 404

        # 7. Reverse Isolation: User B CANNOT access User A's avatar
        cross_get_rev = await client.get(f"/api/v1/avatars/{avatar_a_id}", headers=headers_b)
        assert cross_get_rev.status_code == 404

        # 8. Unauthenticated and invalid token rejections
        no_auth = await client.get("/api/v1/avatars/active")
        assert no_auth.status_code == 401

        bad_auth = await client.get(
            "/api/v1/avatars/active",
            headers={"Authorization": "Bearer totally_forged_invalid_token"},
        )
        assert bad_auth.status_code == 401

        # 9. Duplicate active prevention: Creating a 2nd avatar deactivates the 1st
        payload_a2 = {
            "name": "Alpha Aria Second Outfit",
            "config": {
                "version": 2,
                "baseModelId": "aria_photorealistic",
                "face": {
                    "jawWidth": 0.5,
                    "chinLength": 0.5,
                    "cheekboneHeight": 0.5,
                    "eyeSize": 0.5,
                    "eyeSpacing": 0.5,
                    "noseLength": 0.5,
                    "noseBridgeWidth": 0.5,
                    "lipFullnessUpper": 0.5,
                    "lipFullnessLower": 0.5,
                    "mouthWidth": 0.5,
                },
                "materials": {"skinTone": "#E8B590", "eyeColor": "#3B2219"},
                "hair": {"assetId": "ponytail01", "color": "#2C1B14"},
                "body": {"height": 1.0, "muscle": 0.5, "weight": 0.5},
                "clothing": {"outfitPresetId": "smart_blazer"},
            },
        }

        create_a2 = await client.post("/api/v1/avatars", headers=headers_a, json=payload_a2)
        assert create_a2.status_code == 201
        avatar_a2_id = create_a2.json()["id"]

        # Check that avatar A2 is now the active one
        current_active_a = await client.get("/api/v1/avatars/active", headers=headers_a)
        assert current_active_a.status_code == 200
        assert current_active_a.json()["id"] == avatar_a2_id

        # Check that avatar A1 is still in DB but marked inactive
        get_a1 = await client.get(f"/api/v1/avatars/{avatar_a_id}", headers=headers_a)
        assert get_a1.status_code == 200
        assert get_a1.json()["is_active"] is False

        # Verify only 1 active avatar in listing
        list_a = await client.get("/api/v1/avatars", headers=headers_a)
        assert list_a.status_code == 200
        items = list_a.json()["avatars"]
        active_count = sum(1 for item in items if item["is_active"] is True)
        assert active_count == 1, f"Expected exactly 1 active avatar, found {active_count}"

        # 10. Reactivation behavior: Re-activating avatar A1 deactivates A2
        reactivate = await client.post(f"/api/v1/avatars/{avatar_a_id}/activate", headers=headers_a)
        assert reactivate.status_code == 200
        assert reactivate.json()["is_active"] is True

        refreshed_active = await client.get("/api/v1/avatars/active", headers=headers_a)
        assert refreshed_active.json()["id"] == avatar_a_id

        get_a2 = await client.get(f"/api/v1/avatars/{avatar_a2_id}", headers=headers_a)
        assert get_a2.json()["is_active"] is False

        # 11. Strict input validation and rejection of invalid bounds, formats, and paths
        # A. Morph out of bounds (> 1.0)
        invalid_morph = {
            "name": "Invalid",
            "config": {
                "version": 2,
                "face": {"jawWidth": 1.99},
            },
        }
        res_bad_morph = await client.post("/api/v1/avatars", headers=headers_a, json=invalid_morph)
        assert res_bad_morph.status_code == 422

        # B. Invalid color hex
        invalid_color = {
            "name": "Invalid Color",
            "config": {
                "version": 2,
                "materials": {"skinTone": "not_a_hex"},
            },
        }
        res_bad_color = await client.post("/api/v1/avatars", headers=headers_a, json=invalid_color)
        assert res_bad_color.status_code == 422

        # C. Invalid body height (< 0.85)
        invalid_height = {
            "name": "Invalid Height",
            "config": {
                "version": 2,
                "body": {"height": 0.40},
            },
        }
        res_bad_height = await client.post("/api/v1/avatars", headers=headers_a, json=invalid_height)
        assert res_bad_height.status_code == 422

        # D. Unknown asset ID or path traversal attempt
        traversal_attack = {
            "name": "Attack",
            "config": {
                "version": 2,
                "hair": {"assetId": "../../../../etc/shadow"},
            },
        }
        res_traversal = await client.post("/api/v1/avatars", headers=headers_a, json=traversal_attack)
        assert res_traversal.status_code == 422
