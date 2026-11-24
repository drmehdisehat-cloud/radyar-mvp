'use strict';

const catalog = require('./iran-legal-domains.json');

function normalize(text) {
  return text.normalize('NFKC')
    .replace(/ي|ى/g, 'ی').replace(/ك/g, 'ک')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const domains = catalog.map(([id, title, keywords, researchLeads]) => ({
  id, title, keywords: keywords.split('،').map(normalize),
  researchLeads, sourceStatus: 'unverified'
}));

function findDomains(question) {
  const normalized = ' ' + normalize(question) + ' ';
  return domains.flatMap(({ keywords, ...domain }) => {
    const matches = keywords.filter(keyword => normalized.includes(' ' + keyword + ' '));
    return matches.length ? [{ ...domain, matches }] : [];
  }).sort((a, b) => b.matches.length - a.matches.length);
}

if (require.main === module) {
  const question = process.argv.slice(2).join(' ');
  if (!question.trim()) {
    process.stderr.write('Usage: node research/find-iran-legal-domains.cjs "<synthetic question>"\n');
    process.exitCode = 1;
  } else {
    const matches = findDomains(question);
    process.stdout.write(JSON.stringify({
      status: matches.length ? 'research_leads_only' : 'needs_research',
      matches
    }, null, 2) + '\n');
  }
}

module.exports = { findDomains };
