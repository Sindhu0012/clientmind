# ClientMind — Relationship Intelligence, Powered by Memory

**ClientMind** is an AI agent that remembers everything about your business relationships — every meeting, every promise, every concern — so you never walk into a conversation with a client unprepared again.

Built for **Hindsight**, a persistent memory system that lets AI agents recall and learn from past interactions instead of forgetting everything after each conversation.

---

## The Problem

Freelancers, consultants, sales reps, and agency owners talk to dozens of clients. Each one has their own history — what was promised, what they're worried about, what they said last time. Humans forget most of it. Normal AI chatbots forget *all* of it, every single conversation.

**ClientMind fixes this.** Every note you save becomes a permanent memory. Every time you ask for a briefing, the agent recalls that full history and gives you a sharp, specific summary — not a generic response.

---

## What It Does

- **Save notes** on any client — a call, a concern, a price they pushed back on
- **"Brief me"** — instantly recalls everything relevant about that client and generates a smart, spoken-style summary before your next call or email
- **Draft follow-up email** — writes a ready-to-send email using the full remembered history
- **Portfolio Dashboard** — looks across your *entire* client base at once, flagging relationships going cold and promises that are overdue
- **Relationship health ring** — a visual indicator of how warm or cold each relationship is, right in the client list

---

## How Memory Is Used (Hindsight)

Every note is sent to Hindsight via its `retain` endpoint, where it's broken down into individual, recallable facts. When you ask for a briefing, ClientMind queries Hindsight's `recall` endpoint for everything relevant to that client, then passes those recalled facts to an LLM (Groq) to generate a natural, strategic summary.

This means the agent isn't just storing raw text — it's building a real, evolving picture of each relationship over time, and that memory is the core of what makes the tool useful. Without it, this is just an empty form.

---

## Tech Stack

- **Backend:** Node.js + Express
- **Memory:** [Hindsight](https://hindsight.vectorize.io/) by Vectorize
- **LLM:** [Groq](https://groq.com/) (`openai/gpt-oss-120b`)
- **Frontend:** Vanilla HTML/CSS/JS — no framework, kept intentionally simple and fast

---

## Running It Locally

1. Clone the repo and install dependencies:
```bash
   npm install
```
2. Create a `.env` file in the root with:
GROQ_API_KEY=your_groq_key
HINDSIGHT_API_KEY=your_hindsight_key
HINDSIGHT_ENDPOINT=https://api.hindsight.vectorize.io
PORT=3000

3. Start the server:
```bash
   node server.js
```

4. Open `http://localhost:3000` in your browser.

---

## Built By

Team **Zenith Coders**
