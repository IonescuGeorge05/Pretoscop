import { Search } from 'lucide-react';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/cn';

/** Plain GET form to /cauta: works without JavaScript (autocomplete is added in M14). */
export function SearchBox({ className, defaultValue }: { className?: string; defaultValue?: string }) {
  return (
    <form action="/cauta" method="get" role="search" className={cn('relative flex w-full', className)}>
      <label htmlFor="q" className="sr-only">
        {t('nav.search.button')}
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={defaultValue}
        aria-label={t('nav.search.placeholder')}
        placeholder={t('nav.search.placeholder')}
        autoComplete="off"
        enterKeyHint="search"
        className="h-11 w-full rounded-l-lg border border-r-0 border-line bg-surface px-3 text-[15px] placeholder:text-muted focus:border-brand-500 focus:bg-white focus:outline-none"
      />
      <button
        type="submit"
        className="flex h-11 items-center gap-1.5 rounded-r-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t('nav.search.button')}</span>
      </button>
    </form>
  );
}
