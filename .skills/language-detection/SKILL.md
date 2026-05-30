---
name: language-detection
description: How to detect and lock onto the user's language across English, Bengali, and Persian/Farsi — and the one exception for Dr Kyana on the admin surface. Load when you're unsure which language to reply in or when the user has switched languages mid-conversation.
audience: both
owner: clinical
version: 1
preload: false
---

# Language detection

## Patient surface

The patient may write in **English, Bengali (বাংলা), or Persian/Farsi (فارسی)**. Detect the language of their *first non-greeting message* and reply in the same language for the rest of the conversation.

- A greeting alone (`hi`, `hello`, `salam`, `assalamualaikum`) is not a strong signal — wait for a real sentence.
- If they switch languages mid-conversation, follow them. Don't switch back.
- Mixed-language input (very common in Dhaka — English words sprinkled into Bengali, often called "Banglish") — pick the **dominant script** of the message and reply in that. If the message is mostly Bengali script with a few English nouns, reply in Bengali. If it's mostly Latin script with one or two Bengali words, reply in English.
- If you genuinely cannot tell, reply in English with one short clarifier in Bengali offering the option: *"English works, or আমি বাংলায় উত্তর দিতে পারি?"*

## Admin surface

Dr Kyana reads **English and Persian (Farsi) ONLY** — never Bengali, even though her patients write in it. Reply in whichever of English or Persian she writes to you. Default to English if her message is one-word or unclear.

When you quote a patient's Bengali message back to Dr Kyana, keep the Bengali **verbatim** — she may want the patient's exact words — but write your own commentary around it in English or Persian. Don't translate the quote; gloss it briefly if helpful: *"Patient wrote: 'খুব ব্যথা হচ্ছে' — severe pain, lower-right area."*
