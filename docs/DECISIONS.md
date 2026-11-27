# Decisions log

Newest first. Each entry: date, decision, why, what was rejected.
Device results from the owner's Manta beat docs and other plugins' notes.

## 2026-11-27 — Target device and firmware

- **Decision:** Build and test against a Supernote **Manta** running
  **Chauvet 3.31.45**, using `sn-plugin-lib` ^0.2.3.
- **Why:** That is the owner's device and current firmware. The plugin system
  needs 3.30.45 or later.
- **Rejected:** Supporting the A5X/A6X line or Nomad for now. The layout code
  stays size-agnostic so they can be added later.

## 2026-11-27 — Repository

- **Decision:** The project lives in `IRKnyazev/sn-word-games`. The design
  docs from the planning chat (`DESIGN.md` v0.2, `PLUGIN-SURVEY.md`) are
  committed unchanged as the starting point.
- **Why:** It's a dedicated repo, so CI and releases stay clean.
- **Rejected:** Building inside an unrelated existing repo.
