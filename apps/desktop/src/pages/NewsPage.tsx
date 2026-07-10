/**
 * NewsPage (`/news`) — the "What's new" changelog, reached from the Home
 * sidebar's promo card. A blank shell until there are releases to list.
 */
export function NewsPage() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-7 pb-20 pt-12">
      <header className="mb-8">
        <h1 className="m-0 mb-0.5 text-2xl font-semibold tracking-[-0.3px]">What&apos;s new</h1>
        <p className="m-0 text-[13.5px] text-[var(--text-muted)]">
          Releases and changes to Focus.
        </p>
      </header>
    </div>
  );
}

export default NewsPage;
