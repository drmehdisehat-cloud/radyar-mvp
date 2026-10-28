'use strict';
// Synthetic metadata only. Passing a shape check never certifies legal validity.
const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-check-evidence.cjs');

function gaps(fields = {}) {
  const matrix = {
    topic: 'check', status: 'research-only',
    releaseSourceEligible: false, legalConclusionPermitted: false,
    amendments: [{
      label: 'synthetic-only', independentPrimaryAmendmentTextVerified: true,
      officialGazetteNumber: '12345',
      officialGazettePublicationDate: '1403/04/23',
      effectiveDate: '1403/05/07',
      transitionalApplicabilityVerified: true,
      humanReviewer: 'Synthetic Reviewer', humanReviewedAt: '2026-10-28',
      ...fields
    }]
  };
  const report = audit(matrix);
  assert.equal(report.status, 'RESEARCH_ONLY');
  return report.instruments[0].missingEvidence;
}

test('plausible Persian gazette and effective dates do not create a release approval', () => {
  assert.deepEqual(gaps(), []);
  // A research-only matrix remains research-only even with complete-looking fields.
  assert.ok(!gaps().includes('verified_effective_date'));
});

test('invalid gazette numbers and Persian calendar date shapes retain publication gap', () => {
  const cases = [
    { officialGazetteNumber: '   ' },
    { officialGazetteNumber: 12345 },
    { officialGazettePublicationDate: '1403/13/01' },
    { officialGazettePublicationDate: '1403/00/01' },
    { officialGazettePublicationDate: '1403/07/31' },
    { officialGazettePublicationDate: '1403/04/00' },
    { officialGazettePublicationDate: '1403/04/32' },
    { officialGazettePublicationDate: '2026-10-28' },
    { officialGazettePublicationDate: true }
  ];
  for (const fields of cases) {
    assert.ok(gaps(fields).includes('primary_official_gazette'), JSON.stringify(fields));
  }
});

test('invalid or wrong-calendar effective dates retain commencement gap', () => {
  for (const date of ['1403/13/01', '1403/07/31', '1403/12/31',
                      '1403/05/00', '2026-10-28', '1403/5/07', 14030507, null]) {
    assert.ok(gaps({ effectiveDate: date }).includes('verified_effective_date'),
      String(date));
  }
});

test('commencement before gazette publication is flagged as an inconsistent research claim', () => {
  const impossible = [
    { officialGazettePublicationDate: '1403/04/23', effectiveDate: '1403/04/22' },
    { officialGazettePublicationDate: '1403/01/01', effectiveDate: '1402/12/29' },
    { officialGazettePublicationDate: '1403/05/01', effectiveDate: '1403/04/31' }
  ];
  for (const fields of impossible) {
    assert.ok(gaps(fields).includes('verified_effective_date'), JSON.stringify(fields));
  }
  // Same-day or later commencement is merely structurally consistent.
  // Neither case certifies the actual publication or legal commencement.
  for (const effectiveDate of ['1403/04/23', '1403/05/07']) {
    assert.ok(!gaps({ officialGazettePublicationDate: '1403/04/23', effectiveDate })
      .includes('verified_effective_date'), effectiveDate);
  }
});
