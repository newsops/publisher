const COMMENT_ORIGIN = process.env.NEXT_PUBLIC_COMMENT_ORIGIN ?? ''
const SUBMISSION_ENABLED =
  process.env.NEXT_PUBLIC_COMMENT_SUBMISSION_ENABLED === 'true'

export default function CommentSection({ slug }: { readonly slug: string }) {
  return (
    <section
      className="comments"
      data-comments={slug}
      data-comment-origin={COMMENT_ORIGIN}
      data-comment-submission={SUBMISSION_ENABLED ? 'enabled' : 'disabled'}
    >
      <h2>Comments</h2>
      <p data-comment-status aria-live="polite">
        {COMMENT_ORIGIN
          ? 'Comments load when this section becomes visible.'
          : 'Comments are temporarily unavailable.'}
      </p>
      <ol className="comment-list" data-comment-list />
      {COMMENT_ORIGIN && SUBMISSION_ENABLED ? (
        <form className="comment-form" data-comment-form>
          <label>
            Name
            <input name="authorName" maxLength={80} required />
          </label>
          <label>
            Comment
            <textarea name="body" maxLength={2000} required />
          </label>
          <input type="hidden" name="verificationToken" />
          <p className="comment-verification-note">
            Complete the configured verification challenge before submitting.
          </p>
          <button type="submit">Submit for moderation</button>
          <p data-comment-submit-status aria-live="polite" />
        </form>
      ) : null}
      <script src="/site-runtime/comments.v1.js" defer />
    </section>
  )
}
