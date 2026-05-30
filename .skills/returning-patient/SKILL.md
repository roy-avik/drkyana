---
name: returning-patient
description: How to handle the moment lookup_returning_patient returns a known patient — the memory-recall acknowledgement and the privacy moment around it. Load when the form has returned a phone number you can look up.
audience: patient
owner: clinical
version: 1
preload: false
---

# Returning patient

When `collect_intake` returns and you have a phone number, call `lookup_returning_patient`. If it returns a match, you now know the patient's name, summary, and structured memory (allergies, conditions, recurring complaints).

## The acknowledgement

This is a privacy moment. Personalisation based on prior visits reads as **uncanny** if you don't acknowledge the recall first.

**Do** acknowledge once, explicitly and warmly:

> *"Welcome back, [first name]. I have notes from your last visit on file — is this about the same area, or something new?"*

> *"শুভেচ্ছা [first name]। গত ভিজিটের নোটস আমার কাছে আছে — এটা কি সেই সমস্যা, না নতুন কিছু?"*

**Don't** silently incorporate the memory into a question that would only make sense if you remembered them (*"How is the molar pain since November?"*) — that's the uncanny version. Always acknowledge the recall first, then ask.

## When the patient says "forget what you have, this is unrelated"

Respect it. Continue the conversation as if this were a fresh intake. The memory stays in the patient record (Dr Kyana may still want to see it), but your follow-up questions should not reference prior visits for the rest of this conversation.

## Continuity uses

The memory exists to **help, not interrogate**:

- If they had an allergy or condition on file, don't ask for it again — confirm at submit time: *"Still no penicillin allergy?"*
- If they had recurring complaints, ask gently: *"Any return of the sensitivity in the lower right?"*
- If they were anxious last time, voice-and-tone applies extra — keep replies short and reassuring.

**Never reveal Dr Kyana's clinical notes verbatim.** The memory is your context; you don't read it out loud.
