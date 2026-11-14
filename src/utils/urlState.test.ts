import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchUrlPath, parseResearchUrlState } from './urlState.ts';

const VALID_IDS = new Set(['bass-ii', 'saffire', 'flex-cfi-g']);

test('parseResearchUrlState parses overview, detail, explorer family, and invalid inputs safely', () => {
  assert.deepEqual(parseResearchUrlState('', VALID_IDS, 'bass-ii'), {
    page: 'overview',
  });
  assert.deepEqual(
    parseResearchUrlState('?page=detail&id=saffire', VALID_IDS, 'bass-ii'),
    { page: 'detail', investigationId: 'saffire' }
  );
  assert.deepEqual(
    parseResearchUrlState('?page=detail&id=unknown-id', VALID_IDS, 'bass-ii'),
    { page: 'detail', investigationId: 'bass-ii' }
  );
  assert.deepEqual(
    parseResearchUrlState('?page=explorer&family=ACME', VALID_IDS, 'bass-ii'),
    { page: 'explorer', family: 'ACME' }
  );
  assert.deepEqual(
    parseResearchUrlState('?page=invalid', VALID_IDS, 'bass-ii'),
    { page: 'overview' }
  );
});

test('buildResearchUrlPath produces clean shareable URLs for active pages', () => {
  assert.equal(buildResearchUrlPath('/', { page: 'overview' }), '/');
  assert.equal(
    buildResearchUrlPath('/', { page: 'detail', investigationId: 'saffire' }),
    '/?page=detail&id=saffire'
  );
  assert.equal(
    buildResearchUrlPath('/', { page: 'explorer', family: 'ALL' }),
    '/?page=explorer'
  );
  assert.equal(
    buildResearchUrlPath('/', { page: 'explorer', family: 'SoFIE' }),
    '/?page=explorer&family=SoFIE'
  );
  assert.equal(buildResearchUrlPath('/', { page: 'gaps' }), '/?page=gaps');
});
