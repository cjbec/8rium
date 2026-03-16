require('dotenv').config();

const express = require('express');
const Parser = require('rss-parser');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

const app = express();
const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'RSS Reader/1.0' },
});

// Supabase admin client — lazily initialized so the server starts without a .env
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    }
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabase;
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth middleware ────────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error } = await getSupabase().auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  req.user = user;
  next();
}

// ── Public config — returns Supabase URL + anon key for the frontend ──────────
app.get('/api/config', (req, res) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Supabase environment variables not set. Copy .env.example to .env and fill in your values.' });
  }
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
});

// ── Validate a feed URL (called before saving to Supabase) ───────────────────
app.post('/api/validate-feed', requireAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    const feed = await parser.parseURL(url);
    res.json({
      title: feed.title || url,
      description: feed.description || '',
      link: feed.link || '',
    });
  } catch (err) {
    res.status(400).json({ error: `Invalid feed: ${err.message}` });
  }
});

// ── Proxy: fetch + parse a feed URL and return items ─────────────────────────
app.get('/api/proxy', requireAuth, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url param is required' });

  try {
    const feed = await parser.parseURL(url);
    const items = (feed.items || []).slice(0, 50).map(item => ({
      id: item.guid || item.link || item.title,
      title: item.title || 'Untitled',
      link: item.link || '',
      pubDate: item.pubDate || item.isoDate || null,
      summary: item.contentSnippet || item.summary || '',
      content: item.content || item['content:encoded'] || item.contentSnippet || '',
      author: item.author || item.creator || '',
    }));
    res.json({ title: feed.title, items });
  } catch (err) {
    res.status(400).json({ error: `Failed to fetch feed: ${err.message}` });
  }
});

// ── Full article extractor (Readability) ──────────────────────────────────────
app.get('/api/article', requireAuth, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSSReader/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return res.status(502).json({ error: `Fetch failed: ${response.status}` });

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) return res.status(422).json({ error: 'Could not extract article content' });

    res.json({
      title: article.title,
      content: article.content,
      byline: article.byline,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Explicit fallback so `express.static` path issues don't produce "Cannot GET /"
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3737;
app.listen(PORT, () => {
  console.log(`RSS Reader running at http://localhost:${PORT}`);
});
