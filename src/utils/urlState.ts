import type { AppPage } from '../components/Layout.tsx';

export interface ResearchUrlState {
  page: AppPage;
  investigationId?: string;
  family?: string;
  category?: string;
  demoMode?: boolean;
}

const VALID_PAGES = new Set<AppPage>([
  'overview',
  'explorer',
  'detail',
  'compare',
  'data',
  'graph',
  'documents',
  'evidence',
  'assistant',
  'gaps',
  'workspace',
  'export',
  'sources',
  'about',
]);

export function parseResearchUrlState(
  search: string,
  validInvestigationIds: ReadonlySet<string>,
  fallbackInvestigationId: string
): ResearchUrlState {
  const params = new URLSearchParams(search);
  const rawPage = params.get('page');
  const page: AppPage =
    rawPage && VALID_PAGES.has(rawPage as AppPage)
      ? (rawPage as AppPage)
      : 'overview';
  const demoMode = params.get('demo') === '1';

  if (page === 'detail') {
    const rawId = params.get('id') ?? '';
    const investigationId = validInvestigationIds.has(rawId)
      ? rawId
      : fallbackInvestigationId;
    return demoMode ? { page: 'detail', investigationId, demoMode } : { page: 'detail', investigationId };
  }

  if (page === 'explorer') {
    const rawFamily = params.get('family');
    const rawCategory = params.get('category');
    const state: ResearchUrlState = { page: 'explorer' };
    if (rawFamily && rawFamily !== 'ALL') {
      state.family = rawFamily;
    }
    if (rawCategory && rawCategory !== 'ALL') {
      state.category = rawCategory;
    }
    if (demoMode) state.demoMode = true;
    return state;
  }

  return demoMode ? { page, demoMode } : { page };
}

export function buildResearchUrlPath(
  pathname: string,
  state: ResearchUrlState
): string {
  const basePath = pathname || '/';
  const params = new URLSearchParams();

  if (state.page !== 'overview') {
    params.set('page', state.page);
    if (state.page === 'detail' && state.investigationId) {
      params.set('id', state.investigationId);
    } else if (state.page === 'explorer') {
      if (state.family && state.family !== 'ALL') {
        params.set('family', state.family);
      }
      if (state.category && state.category !== 'ALL') {
        params.set('category', state.category);
      }
    }
  }

  if (state.demoMode) {
    params.set('demo', '1');
  }

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
