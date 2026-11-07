"""Read-only 0G chain data used to ground blockchain conversations."""

import re
from decimal import Decimal

import httpx

from app.core.config import settings
from app.core.exceptions import ProviderConfigurationError

ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")

_BLOCKCHAIN_TERMS = (
    r"wallet",
    r"balance",
    r"wallet\s+address",
    r"qr\s+code",
    r"crypto",
    r"blockchain",
    r"on-?chain",
    r"transaction",
    r"tx\s+hash",
    r"0g",
    r"ethereum",
    r"evm",
    r"gas\s+fee",
    r"airdrop",
    r"stake|staking",
    r"nft",
)
_BLOCKCHAIN_RE = re.compile(
    r"\b(?:" + "|".join(_BLOCKCHAIN_TERMS) + r")\b",
    re.IGNORECASE,
)


def is_blockchain_request(message: str) -> bool:
    if not message:
        return False
    if ADDRESS_RE.fullmatch(message.strip()):
        return True
    return bool(_BLOCKCHAIN_RE.search(message))


async def get_native_balance(address: str) -> dict:
    if not ADDRESS_RE.fullmatch(address):
        raise ValueError("Invalid EVM wallet address")
    payload = {"jsonrpc": "2.0", "id": 1, "method": "eth_getBalance", "params": [address, "latest"]}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(settings.OG_RPC_URL, json=payload)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ProviderConfigurationError("0G RPC is unavailable") from exc
    if data.get("error") or not isinstance(data.get("result"), str):
        raise ProviderConfigurationError("0G RPC returned an invalid balance response")
    wei = int(data["result"], 16)
    return {
        "address": address,
        "chain": settings.OG_CHAIN_NAME,
        "balance_wei": str(wei),
        "balance_og": format(Decimal(wei) / Decimal(10**18), "f"),
        "qr_payload": f"ethereum:{address}",
    }
