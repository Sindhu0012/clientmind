require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const { GROQ_API_KEY, HINDSIGHT_API_KEY, HINDSIGHT_ENDPOINT, PORT } = process.env;
const DATA_DIR = path.join(__dirname, 'data');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CLIENTS_FILE)) {
    const starter = [
      { id: 'client_raj', name: 'Raj Malhotra', company: 'Acme Corp', lastContact: '2026-09-20T00:00:00.000Z' },
      { id: 'client_priya', name: 'Priya Nair', company: 'Bluewave Consulting', lastContact: '2026-09-10T00:00:00.000Z' },
      { id: 'client_arjun', name: 'Arjun Mehta', company: 'Northstar Retail', lastContact: '2026-08-28T00:00:00.000Z' }
    ];
    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(starter, null, 2));
  }
  if (!fs.existsSync(NOTES_FILE)) fs.writeFileSync(NOTES_FILE, JSON.stringify({}, null, 2));
}
ensureDataFiles();

function loadClients() { return JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf-8')); }
function saveClients(c) { fs.writeFileSync(CLIENTS_FILE, JSON.stringify(c, null, 2)); }
function loadNotes() { return JSON.parse(fs.readFileSync(NOTES_FILE, 'utf-8')); }
function saveNotes(n) { fs.writeFileSync(NOTES_FILE, JSON.stringify(n, null, 2)); }
function slugify(name) {
  return 'client_' + name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now().toString(36);
}
function daysSince(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// ---- Hindsight helpers ----
async function retainMemory(bankId, content) {
  const res = await fetch(`${HINDSIGHT_ENDPOINT}/v1/default/banks/${bankId}/memories`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${HINDSIGHT_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ content }] })
  });
  if (!res.ok) throw new Error(`Hindsight retain failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function recallMemory(bankId, query) {
  const res = await fetch(`${HINDSIGHT_ENDPOINT}/v1/default/banks/${bankId}/memories/recall`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${HINDSIGHT_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  if (!res.ok) throw new Error(`Hindsight recall failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function askGroq(systemPrompt, userPrompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
    })
  });
  if (!res.ok) throw new Error(`Groq failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

// ===== CLIENTS =====

app.get('/api/clients', (req, res) => {
  const clients = loadClients().map(c => {
    const days = daysSince(c.lastContact);
    return { ...c, daysSinceContact: days, isCold: days >= 14 };
  });
  res.json({ success: true, clients });
});

app.post('/api/clients', (req, res) => {
  const { name, company } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const clients = loadClients();
  const newClient = { id: slugify(name), name, company: company || '', lastContact: new Date().toISOString() };
  clients.push(newClient);
  saveClients(clients);
  res.json({ success: true, client: newClient });
});

app.delete('/api/clients/:id', (req, res) => {
  const clients = loadClients();
  const filtered = clients.filter(c => c.id !== req.params.id);
  if (filtered.length === clients.length) return res.status(404).json({ error: 'Client not found' });
  saveClients(filtered);
  const notes = loadNotes();
  delete notes[req.params.id];
  saveNotes(notes);
  res.json({ success: true });
});

// ===== MEMORY =====

app.get('/api/clients/:id/notes', (req, res) => {
  const notes = loadNotes();
  res.json({ success: true, notes: notes[req.params.id] || [] });
});

app.post('/api/save-note', async (req, res) => {
  try {
    const { clientId, note } = req.body;
    if (!clientId || !note) return res.status(400).json({ error: 'clientId and note are required' });

    await retainMemory(clientId, note);

    const notes = loadNotes();
    if (!notes[clientId]) notes[clientId] = [];
    notes[clientId].unshift({ text: note, timestamp: new Date().toISOString() });
    saveNotes(notes);

    const clients = loadClients();
    const client = clients.find(c => c.id === clientId);
    if (client) { client.lastContact = new Date().toISOString(); saveClients(clients); }

    res.json({ success: true, message: 'Note saved to memory.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/brief', async (req, res) => {
  try {
    const { clientId, clientName } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    const recallResult = await recallMemory(
      clientId,
      'Everything relevant: past meetings, promises made, concerns raised, pricing sensitivity, last contact.'
    );
    const memories = (recallResult.results || []).map(m => m.text).join('\n- ');

    let summary;
    if (!memories) {
      summary = `No history yet for ${clientName || 'this client'}. Add a note, then ask for a briefing again.`;
    } else {
      summary = await askGroq(
        'You are a sharp, concise relationship-intelligence assistant for a busy professional. Given raw memory notes about a client, write a short spoken-style briefing: what to remember before contacting them, any promises owed, concerns to address, and pricing sensitivity. Keep it under 150 words.',
        `Client: ${clientName || clientId}\nRemembered facts:\n- ${memories}`
      );
    }
    res.json({ success: true, briefing: summary, rawMemoryCount: (recallResult.results || []).length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== NEW: PORTFOLIO DASHBOARD =====
app.get('/api/dashboard', async (req, res) => {
  try {
    const clients = loadClients().map(c => {
      const days = daysSince(c.lastContact);
      return { ...c, daysSinceContact: days, isCold: days >= 14 };
    });

    if (!clients.length) {
      return res.json({ success: true, coldRelationships: [], overduePromises: [], warmestClient: null });
    }

    // Cold relationships - pure computation, always accurate
    const coldRelationships = clients
      .filter(c => c.isCold)
      .map(c => `${c.name} (${c.company || 'no company'}) — ${c.daysSinceContact} day${c.daysSinceContact === 1 ? '' : 's'} since last contact`);

    // Warmest client - pure computation, always accurate
    const warmest = clients.reduce((a, b) => (a.daysSinceContact <= b.daysSinceContact ? a : b));
    const warmestClient = `${warmest.name} (${warmest.company || 'no company'}) — contacted ${warmest.daysSinceContact === 0 ? 'today' : warmest.daysSinceContact + ' days ago'}`;

    // Overdue promises - checked per client, skips silently on any single failure
    const overduePromises = [];
    const today = new Date().toISOString().split('T')[0];
    for (const c of clients) {
      try {
        const recallResult = await recallMemory(c.id, 'follow-up promises, deadlines, dates, commitments made');
        const memories = (recallResult.results || []).map(m => m.text).join('\n- ');
        if (!memories) continue;
        const analysis = await askGroq(
          `You check if a client relationship has an overdue promise. Today's date is ${today}. Given remembered facts about a client, respond with EXACTLY one short line naming the overdue item if its date has clearly passed relative to today. If nothing is overdue or no date is mentioned, respond with EXACTLY the word NONE and nothing else.`,
          `Client: ${c.name}\nRemembered facts:\n- ${memories}`
        );
        const trimmed = (analysis || '').trim();
        if (trimmed && trimmed.toUpperCase() !== 'NONE' && trimmed.length < 200) {
          overduePromises.push(`${c.name} — ${trimmed}`);
        }
      } catch (innerErr) {
        console.error('dashboard check skipped for', c.id, innerErr.message);
      }
    }

    res.json({ success: true, coldRelationships, overduePromises, warmestClient });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== NEW: DRAFT FOLLOW-UP EMAIL =====
app.post('/api/draft-email', async (req, res) => {
  try {
    const { clientId, clientName } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    const recallResult = await recallMemory(
      clientId,
      'Everything relevant: past meetings, promises made, concerns raised, pricing sensitivity, last contact.'
    );
    const memories = (recallResult.results || []).map(m => m.text).join('\n- ');

    if (!memories) {
      return res.json({
        success: true,
        subject: 'Checking in',
        body: `Hi,\n\nJust wanted to check in and see how things are going on your end. Let me know if there's anything I can help with.\n\nBest`
      });
    }

    const raw = await askGroq(
      'You write concise, professional follow-up emails for a busy consultant or salesperson. Given remembered facts about a client, write a natural follow-up email referencing specific details (promises, concerns, pricing) without sounding robotic. Respond in EXACTLY this format and nothing else:\nSUBJECT: <subject line>\nBODY:\n<email body>',
      `Client: ${clientName || clientId}\nRemembered facts:\n- ${memories}`
    );

    let subject = 'Following up';
    let body = raw;
    const subjectMatch = raw.match(/SUBJECT:\s*(.+)/i);
    const bodyMatch = raw.match(/BODY:\s*([\s\S]*)/i);
    if (subjectMatch) subject = subjectMatch[1].trim();
    if (bodyMatch) body = bodyMatch[1].trim();

    res.json({ success: true, subject, body });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ClientMind server is running' }));

app.listen(PORT || 3000, () => {
  console.log(`ClientMind server running on http://localhost:${PORT || 3000}`);
});
