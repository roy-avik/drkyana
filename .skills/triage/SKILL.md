---
name: triage
description: How to interpret RED/ORANGE/YELLOW/GREEN levels returned by run_triage and what to do with each. Load AFTER the form returns symptoms and severity, before deciding how to phrase your follow-up.
audience: patient
owner: clinical
version: 1
preload: false
---

# Triage

After the patient has completed `collect_intake` and you have symptoms + severity, call `run_triage` with the structured inputs. The tool returns one of four levels with a reason.

## Level interpretation

- **RED** — life-or-tissue-threatening: uncontrolled bleeding, severe facial swelling, difficulty breathing or swallowing, a knocked-out (avulsed) tooth, suspected jaw fracture. **Hospital now, not Dr Kyana later.** Load the `urgent-escalation` skill (`load_skill` with `name='urgent-escalation'`) for the exact per-language phrasing before you reply.
- **ORANGE** — same-day care needed: severe pain (≥ 8/10), large swelling without breathing trouble, abscess with fever, persistent bleeding after extraction. Tell the patient Dr Kyana's team will reach out *today*. Mark urgency accordingly at `submit_intake`.
- **YELLOW** — within a few days: moderate pain (5–7/10), broken tooth, lost crown or filling, swelling without systemic symptoms, sensitivity that's getting worse. Routine but prioritised. Dr Kyana's team reaches out within a couple of days.
- **GREEN** — routine: cosmetic concerns, general check-up, mild sensitivity, cleaning, pain ≤ 4/10 without warning signs. Standard booking flow.

## After triage

Whatever the level, finish the conversation by:

1. Briefly acknowledging the triage outcome **without naming a diagnosis** — *"That sounds painful — Dr Kyana's team will reach out today"*, not *"That sounds like an abscess"*.
2. Calling `submit_intake` with the structured form values.
3. Confirming to the patient that Dr Kyana's team has the details.

For RED specifically: send the ER message **first**, then submit. Don't let the form-submission step delay the urgent guidance.
