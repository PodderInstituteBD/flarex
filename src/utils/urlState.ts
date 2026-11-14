import type { AppPage } from '../components/Layout.tsx';

export interface ResearchUrlState {
  page: AppPage;
  investigationId?: string;
  family?: string;
  category?: string;
}

const VALID_PAGES = new Set<AppPage>([
  'overview',
  'explorer',
  'detail',
  'compare',
  'data',
  'assistant',
  'gaps',
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

  if (page === 'detail') {
    const rawId = params.get('id') ?? '';
    const investigationId = validInvestigationIds.has(rawId)
      ? rawId
      : fallbackInvestigationId;
    return { page: 'detail', investigationId };
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
    return state;
  }

  return { page };
}

export function buildResearchUrlPath(
  pathname: string,
  state: ResearchUrlState
): string {
  const basePath = pathname || '/';
  if (state.page === 'overview') {
    return basePath;
  }

  const params = new URLSearchParams();
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

  return `${basePath}?${params.toString()}`;
}
