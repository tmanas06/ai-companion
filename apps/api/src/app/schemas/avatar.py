from datetime import datetime
from typing import Annotated, List, Literal, Optional, Union
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


# Supported Asset Enumerations (Allowlist to prevent path traversal and arbitrary asset references)
SupportedBaseModelId = Literal[
    "aria_photorealistic",
    "marcus_photorealistic",
    "human_female_v1",
    "human_male_v1",
    "human_universal_v1",
]

SupportedHairAssetId = Literal[
    "ponytail01",
    "short02",
    "bob01",
    "wavy_long",
    "buzz_cut",
    "afro_fade",
    "none",
]

SupportedClothingAssetId = Literal[
    "female_elegantsuit01",
    "male_casualsuit01",
    "casual_tshirt_jeans",
    "smart_blazer",
    "athletic_wear",
    "default",
]

SupportedAccessoryAssetId = Literal[
    "glasses_round",
    "glasses_classic",
    "earrings_studs",
    "necklace_simple",
    "none",
]


class BaseStudioModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        extra="forbid",
    )


# ---------------------------------------------------------
# Legacy 2D Layer Configuration (Version 1)
# ---------------------------------------------------------
class AvatarLayerConfig(BaseModel):
    type: str = Field(pattern="^(skin|eyes|hair|clothing|accessory|background)$")
    variant: str
    color: Optional[str] = None
    z_index: int = 0
    visible: bool = True


class AvatarConfig(BaseModel):
    version: Literal[1] = 1
    layers: List[AvatarLayerConfig] = Field(default_factory=list)


# ---------------------------------------------------------
# 3D Avatar Configuration (Version 2)
# ---------------------------------------------------------
class FaceMorphParametersSchema(BaseStudioModel):
    jaw_width: float = Field(default=0.5, ge=0.0, le=1.0)
    jaw_angle: Optional[float] = Field(default=0.5, ge=0.0, le=1.0)
    chin_length: float = Field(default=0.5, ge=0.0, le=1.0)
    chin_prominence: Optional[float] = Field(default=0.5, ge=0.0, le=1.0)
    cheekbone_height: float = Field(default=0.5, ge=0.0, le=1.0)
    cheekbone_fullness: Optional[float] = Field(default=0.5, ge=0.0, le=1.0)
    eye_size: float = Field(default=0.5, ge=0.0, le=1.0)
    eye_spacing: float = Field(default=0.5, ge=0.0, le=1.0)
    eye_slant: Optional[float] = Field(default=0.5, ge=0.0, le=1.0)
    nose_length: float = Field(default=0.5, ge=0.0, le=1.0)
    nose_bridge_width: float = Field(default=0.5, ge=0.0, le=1.0)
    nose_tip_angle: Optional[float] = Field(default=0.5, ge=0.0, le=1.0)
    nose_flare: Optional[float] = Field(default=0.5, ge=0.0, le=1.0)
    lip_fullness_upper: float = Field(default=0.5, ge=0.0, le=1.0)
    lip_fullness_lower: float = Field(default=0.5, ge=0.0, le=1.0)
    mouth_width: float = Field(default=0.5, ge=0.0, le=1.0)
    ear_size: Optional[float] = Field(default=0.5, ge=0.0, le=1.0)


class MaterialParametersSchema(BaseStudioModel):
    skin_tone: str = Field(default="#E8B590", pattern=r"^#[0-9a-fA-F]{6}$")
    skin_roughness: Optional[float] = Field(default=0.6, ge=0.0, le=1.0)
    eye_color: str = Field(default="#3B2219", pattern=r"^#[0-9a-fA-F]{6}$")
    eye_roughness: Optional[float] = Field(default=0.1, ge=0.0, le=1.0)
    teeth_roughness: Optional[float] = Field(default=0.16, ge=0.0, le=1.0)


class HairConfigurationSchema(BaseStudioModel):
    asset_id: SupportedHairAssetId = "ponytail01"
    color: str = Field(default="#2C1B14", pattern=r"^#[0-9a-fA-F]{6}$")
    roughness: Optional[float] = Field(default=0.8, ge=0.0, le=1.0)


class BodyParametersSchema(BaseStudioModel):
    height: float = Field(default=1.0, ge=0.85, le=1.15)
    muscle: float = Field(default=0.5, ge=0.0, le=1.0)
    weight: float = Field(default=0.5, ge=0.0, le=1.0)


class ClothingConfigurationSchema(BaseStudioModel):
    top_asset_id: Optional[SupportedClothingAssetId] = None
    top_color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    bottom_asset_id: Optional[SupportedClothingAssetId] = None
    bottom_color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    shoes_asset_id: Optional[SupportedClothingAssetId] = None
    outfit_preset_id: Optional[SupportedClothingAssetId] = "female_elegantsuit01"


class AccessoryItemSchema(BaseStudioModel):
    asset_id: SupportedAccessoryAssetId
    slot: Literal["eyes", "ears", "neck", "wrist"]
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class BehaviorConfigurationSchema(BaseStudioModel):
    default_pose: Optional[Literal["neutral", "relaxed", "confident", "friendly"]] = "relaxed"
    blink_frequency_multiplier: Optional[float] = Field(default=1.0, ge=0.5, le=2.0)
    smile_tendency: Optional[float] = Field(default=0.5, ge=0.0, le=1.0)


class Avatar3DConfigSchema(BaseStudioModel):
    version: Literal[2] = 2
    base_model_id: SupportedBaseModelId = "aria_photorealistic"
    face: FaceMorphParametersSchema = Field(default_factory=FaceMorphParametersSchema)
    materials: MaterialParametersSchema = Field(default_factory=MaterialParametersSchema)
    hair: HairConfigurationSchema = Field(default_factory=HairConfigurationSchema)
    body: BodyParametersSchema = Field(default_factory=BodyParametersSchema)
    clothing: ClothingConfigurationSchema = Field(default_factory=ClothingConfigurationSchema)
    accessories: List[AccessoryItemSchema] = Field(default_factory=list)
    behavior: Optional[BehaviorConfigurationSchema] = Field(default_factory=BehaviorConfigurationSchema)


# Discriminated union supporting both v1 (2D) and v2 (3D) configurations
AvatarConfigUnion = Annotated[
    Union[AvatarConfig, Avatar3DConfigSchema],
    Field(discriminator="version"),
]


# ---------------------------------------------------------
# Avatar CRUD Schemas
# ---------------------------------------------------------
class AvatarCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    config: AvatarConfigUnion


class AvatarUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    config: Optional[AvatarConfigUnion] = None
    is_active: Optional[bool] = None


class AvatarResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    config_version: int
    config: Union[Avatar3DConfigSchema, AvatarConfig, dict]
    preview_url: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AvatarListResponse(BaseModel):
    avatars: List[AvatarResponse]
    total: int
    page: int
    page_size: int


class AvatarAssetCreate(BaseModel):
    layer_type: str
    variant: str
    asset_url: str
    metadata: Optional[dict] = None


class AvatarAssetResponse(BaseModel):
    id: UUID
    layer_type: str
    variant: str
    asset_url: str
    metadata: dict
    created_at: datetime

    class Config:
        from_attributes = True