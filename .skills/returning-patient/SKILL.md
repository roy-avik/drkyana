---
name: returning-patient
description: How to handle the moment lookup_returning_patient returns a known patient — the memory-recall acknowledgement and the privacy moment around it. Load on a booking/urgent intent, before opening the form, since lookup runs first to pre-fill.
audience: patient
owner: clinical
version: 1
preload: false
---

# Returning patient

On a booking/urgent intent, call `lookup_returning_patient` **before** opening the form. It matches on the session's verified email automatically (no phone needed). If it returns a match, you know the patient's phone, age, gender, summary, and structured memory (allergies, conditions, medications, recurring complaints) — and the form should open **pre-filled** with all of it (see the intake-collection skill for the field mapping).

## The name is a variable — never the real thing

You **never** receive the patient's real name. `lookup_returning_patient` returns it as the literal token `{{patient_name}}` (it is PII and must not reach you). To greet them, write the token verbatim — the app swaps it for the real name when the patient reads your message. So write `Welcome back, {{patient_name}}`, not a guessed name. Never ask the patient to tell you their name, and never invent one.

## The acknowledgement

This is a privacy moment. Opening a form already populated with their old details reads as **uncanny** if you don't acknowledge the recall first.

**Do** acknowledge once, explicitly and warmly — in the same turn you open the pre-filled form, using the name token:

> *"Welcome back, {{patient_name}} — I've brought up the details we had on file for you to review and update."*

> *"শুভেচ্ছা {{patient_name}} — আগের তথ্যগুলো নিয়ে এসেছি, একটু দেখে আপডেট করে নিন।"*

**Don't** silently incorporate the memory into a question that would only make sense if you remembered them (*"How is the molar pain since November?"*) — that's the uncanny version. Acknowledge the recall first.

## When the patient says "forget what you have, this is unrelated"

Respect it. Continue the conversation as if this were a fresh intake. The memory stays in the patient record (Dr Kyana may still want to see it), but your follow-up questions should not reference prior visits for the rest of this conversation.

## Continuity uses

The memory exists to **help, not interrogate**:

- Allergies/conditions/medications on file are already pre-filled in the form — they don't re-type them; just confirm during the readback: *"Still no penicillin allergy?"*
- If they had recurring complaints, ask gently: *"Any return of the sensitivity in the lower right?"*
- If they were anxious last time, voice-and-tone applies extra — keep replies short and reassuring.

**Never reveal Dr Kyana's clinical notes verbatim.** The memory is your context; you don't read it out loud.
