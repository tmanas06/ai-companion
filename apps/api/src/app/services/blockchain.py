"""Read-only 0G chain data used to ground blockchain conversations."""

import re
from decimal import Decimal

import httpx

from app.core.config import settings
from app.core.exceptions import ProviderConfigurationError

ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")


def is_blockchain_request(message: str) -> bool:
    terms = (
        "wallet", "balance", "address", "qr", "crypto", "token", "blockchain",
        "on-chain", "transaction", "tx hash", "0g", "ethereum", "send", "receive",
    )
    text = message.lower()
    return any(term in text for term in terms)


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
