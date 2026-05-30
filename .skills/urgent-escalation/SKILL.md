---
name: urgent-escalation
description: The hospital-now language for RED triage outcomes and obvious dental emergencies — what to say in each language, what NOT to say, and how to keep the intake flow alive after the urgent message. Load whenever run_triage returns RED or the patient describes a clear dental emergency directly.
audience: patient
owner: clinical
version: 1
preload: false
---

# Urgent escalation

RED triage means hospital first, Dr Kyana later. The wording matters — too soft and the patient delays; too alarmist and the patient panics. Use these almost verbatim.

## The phrasing

**English:**
> *"From what you're describing, this needs an emergency department now — not a clinic visit. Please go to the nearest hospital or ER. I'll still take your details so Dr Kyana has the full picture, but the hospital is the first step."*

**Bengali:**
> *"আপনি যা বলছেন তা শুনে মনে হচ্ছে এটা এখুনি ER বা হাসপাতালে দেখানো দরকার, ক্লিনিক নয়। দয়া করে নিকটতম হাসপাতালে যান। আমি আপনার তথ্য নিয়ে রাখব যাতে ডাঃ কেয়ানা পরে সব দেখতে পারেন, কিন্তু এই মুহূর্তে হাসপাতালই আগে।"*

**Persian:**
> *"از آنچه می‌گویید این مورد نیاز فوری به اورژانس دارد، نه مراجعه به کلینیک. لطفاً به نزدیک‌ترین بیمارستان بروید. من اطلاعات شما را ثبت می‌کنم تا دکتر کیانا بعداً تصویر کامل را داشته باشد، اما الان بیمارستان اولویت است."*

## What triggers this (without waiting for run_triage)

If the patient describes any of these directly, the escalation message goes first — don't wait for the triage tool to formalise what you can already see:

- Uncontrolled bleeding (won't stop with 15 min of pressure)
- Severe facial swelling, especially if spreading or affecting the eye
- Difficulty breathing or swallowing
- A knocked-out (avulsed) permanent tooth — time matters, ideally < 1 hour
- Suspected jaw fracture from trauma
- High fever (> 38.5 °C) with mouth pain or swelling

If `run_triage` returns RED, send this message before doing anything else.

## After the urgent message

Keep the intake flow alive. The patient may not have time or energy to fill the full form — that's fine. With just a phone number and the described emergency, call `submit_intake` and confirm Dr Kyana's team has it. The ER visit is the immediate priority; Dr Kyana's continuity comes after.

## What not to say

- Don't diagnose (*"you have an abscess"*).
- Don't speculate on cause (*"this is probably an infection"*).
- Don't suggest home remedies — that's clinical advice, and time spent on remedies is time not spent at the ER.
- Don't promise Dr Kyana will see them — she may not be the right next step at all.
