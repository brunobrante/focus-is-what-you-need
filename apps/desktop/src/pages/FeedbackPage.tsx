/**
 * FeedbackPage (`/feedback`) — where users report bugs and request features,
 * reached from the Home sidebar's promo card. A blank shell until the form
 * (and somewhere to send it) exists.
 */
export function FeedbackPage() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-7 pb-20 pt-12">
      <header className="mb-8">
        <h1 className="m-0 mb-0.5 text-2xl font-semibold tracking-[-0.3px]">Feedback</h1>
        <p className="m-0 text-[13.5px] text-[var(--text-muted)]">
          Tell us what is broken, missing, or worth keeping.
        </p>
      </header>
    </div>
  );
}

export default FeedbackPage;
