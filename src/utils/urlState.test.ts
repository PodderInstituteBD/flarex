import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchUrlPath, parseResearchUrlState } from './urlState.ts';

const VALID_IDS = new Set(['bass-ii', 'saffire', 'flex-cfi-g']);

test('parseResearchUrlState parses overview, detail, explorer family, new 3.0 routes, and invalid inputs safely', () => {
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
  for (const page of ['graph', 'documents', 'evidence', 'workspace', 'export'] as const) {
    assert.deepEqual(parseResearchUrlState(`?page=${page}`, VALID_IDS, 'bass-ii'), {
      page,
    });
  }
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
  assert.equal(buildResearchUrlPath('/', { page: 'graph' }), '/?page=graph');
  assert.equal(buildResearchUrlPath('/', { page: 'documents' }), '/?page=documents');
  assert.equal(buildResearchUrlPath('/', { page: 'evidence' }), '/?page=evidence');
  assert.equal(buildResearchUrlPath('/', { page: 'workspace' }), '/?page=workspace');
  assert.equal(buildResearchUrlPath('/', { page: 'export' }), '/?page=export');
});
