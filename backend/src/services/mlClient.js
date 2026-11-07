/**
 * Client for the Python AI service (ml-service).
 * Pipeline (proposal section 3.5):
 *   1. /classify   -> NLP category + language detection
 *   2. backend computes historical context (similar complaints in same area)
 *   3. /prioritize -> ML priority level using category, location, history, risk
 * If the AI service is down, the complaint is still accepted with safe defaults
 * (source = 'fallback') so citizens are never blocked.
 */
const env = require('../config/env');
const { CATEGORIES, PRIORITIES } = require('../utils/constants');

async function post(pathname, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.mlTimeoutMs);
  try {
    const res = await fetch(`${env.mlServiceUrl}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ML service ${pathname} returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function classify(text) {
  try {
    const r = await post('/classify', { text });
    if (!CATEGORIES.includes(r.category)) throw new Error(`unknown category ${r.category}`);
    return {
      category: r.category,
      confidence: typeof r.confidence === 'number' ? r.confidence : null,
      language: ['en', 'fr', 'ar', 'arabizi', 'mixed'].includes(r.language) ? r.language : 'unknown',
      probabilities: r.probabilities || null,
      model: r.model || null,
      source: 'ai',
    };
  } catch (err) {
    console.warn('[ml] classify failed, using fallback:', err.message);
    return { category: 'other', confidence: null, language: 'unknown', source: 'fallback' };
  }
}

async function prioritize(features) {
  try {
    const r = await post('/prioritize', features);
    if (!PRIORITIES.includes(r.priority)) throw new Error(`unknown priority ${r.priority}`);
    return {
      priority: r.priority,
      score: typeof r.score === 'number' ? r.score : null,
      probabilities: r.probabilities || null,
      model: r.model || null,
      source: 'ai',
    };
  } catch (err) {
    console.warn('[ml] prioritize failed, using fallback:', err.message);
    return { priority: 'medium', score: null, source: 'fallback' };
  }
}

/** Chatbot NLU: { intent, confidence, language, entities } ; null if the AI service is unreachable. */
async function intent(text) {
  try {
    return await post('/intent', { text });
  } catch (err) {
    console.warn('[ml] intent failed:', err.message);
    return null;
  }
}

async function health() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${env.mlServiceUrl}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = { classify, prioritize, intent, health };
