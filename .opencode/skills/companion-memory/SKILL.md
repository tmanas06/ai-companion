---
name: companion-memory
description: Implement persistent, privacy-conscious conversational memory for an AI companion.
---

# Companion Memory

- Separate conversation history, short-term context, and persistent memories.
- Associate every memory with the correct user and companion.
- Store provenance, timestamps, and confidence where appropriate.
- Automatically save routine preferences according to the disclosed memory policy.
- Require explicit user approval before saving sensitive memories.
- Do not treat model-generated inferences as confirmed user facts.
- Allow users to inspect, correct, and delete saved memories.
- Ensure deletion propagates to derived memory records and search indexes.
- Enforce authorization on every memory operation.
- Prevent cross-user memory leakage.
- Add tests for consent, retrieval, authorization, and deletion.
