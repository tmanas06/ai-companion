from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.models import User
from app.services.blockchain import get_native_balance

router = APIRouter()


@router.get("/wallet")
async def wallet_snapshot(current_user: User = Depends(get_current_user)):
    """Return the signed-in user's address, QR payload, and current 0G native balance."""
    if not current_user.wallet_address:
        raise HTTPException(status_code=404, detail="No wallet is linked to this account")
    try:
        return await get_native_balance(current_user.wallet_address)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
