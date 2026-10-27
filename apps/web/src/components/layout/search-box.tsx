import { t } from '@/lib/i18n';
import { SearchBoxClient } from './search-box-client';

/** GET form to /cauta with autocomplete (works without JavaScript; strings stay on the server). */
export function SearchBox({ className, defaultValue }: { className?: string; defaultValue?: string }) {
  return <SearchBoxClient className={className} defaultValue={defaultValue} placeholder={t('nav.search.placeholder')} buttonLabel={t('nav.search.button')} />;
}
