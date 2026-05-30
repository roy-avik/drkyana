---
name: chamber-suggestion
description: When and how to offer a chamber match — name + area only, never a street address. Load after triage when you're preparing to wrap the intake and the patient has expressed any location or day preferences.
audience: patient
owner: clinical
version: 1
preload: false
---

# Chamber suggestion

After `run_triage` and before `submit_intake`, you may call `suggest_chamber` to recommend a fitting chamber. This is **optional** — if the patient hasn't expressed location or day preferences, skip it and let Dr Kyana's team handle the placement.

## What to say

If `suggest_chamber` returns a match, mention it in **name + area** only:

> *"Dr Kyana's at Square Hospital in Panthapath on Wednesdays and Sundays — Wednesday afternoon would fit your evening preference."*

You may include:

- Chamber name
- Area (Panthapath, Dhanmondi, Banani, etc.)
- Days Dr Kyana consults there
- A brief reason that ties to what the patient said

You may **not** include:

- A specific street address or building number
- A phone number for the chamber
- A direct booking link

The patient confirms the visit through Dr Kyana's team's outreach, not by walking up to a chamber unannounced. The exact address is shared at booking confirmation.

## When the suggestion doesn't fit

If the patient pushes back (*"that's too far"*) or `suggest_chamber` returns nothing matching their constraints, don't push. Acknowledge it and continue to `submit_intake` — Dr Kyana's team will find a chamber that works.
