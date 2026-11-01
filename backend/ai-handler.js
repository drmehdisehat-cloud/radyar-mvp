'use strict';
const { verifyPreviewBearer, isValidPreviewToken } = require('./preview-auth');
const { answerChat, validateChat } = require('./ai-chat');
const { TextDecoder } = require('node:util');
// A single local owner: global quotas avoid IP-spoofed budget bypass.
function createChatHandler({ env = process.env, answer = answerChat, now = Date.now } = {}) {
  let day = -1, count = 0, active = 0;
  return async function handleChat(req, send) {
    if (!isValidPreviewToken(env.DADYAR_PREVIEW_TOKEN) || !env.OPENAI_API_KEY)
      return send(503, { error: 'ai_not_configured' });
    if (!verifyPreviewBearer(req, env.DADYAR_PREVIEW_TOKEN)) return send(401, { error: 'authentication_required' });
    if (req.method !== 'POST') return send(405, { error: 'post_required' });
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '') ||
        req.headers['content-encoding']) return send(415, { error: 'json_required' });
    const today = Math.floor(now() / 86400000);
    if (today !== day) { day = today; count = 0; }
    if (count >= 30 || active >= 2) return send(429, { error: 'preview_limit_reached' });
    let size = 0;
    try {
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 48000) { send(413, { error: 'payload_too_large' }); return; }
        chunks.push(chunk);
      }
      const data = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Buffer.concat(chunks)));
      if (!validateChat(data)) return send(422, { error: 'synthetic_conversation_required' });
      // Recheck after asynchronous body reading to enforce concurrency and quota.
      if (count >= 30 || active >= 2) return send(429, {error:'preview_limit_reached'});
      count++; active++;
      try {
        const result = await answer(data, {apiKey:env.OPENAI_API_KEY,model:env.OPENAI_MODEL || 'gpt-4.1-mini'});
        send(200, result);
      } catch { send(502, {error:'provider_unavailable'}); }
      finally { active--; }
    } catch { send(400, {error:'invalid_json'}); }
  };
}
module.exports = { createChatHandler, handleChat: createChatHandler() };
