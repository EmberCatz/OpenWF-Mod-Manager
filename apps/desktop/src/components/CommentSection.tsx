import { useEffect, useState } from "react";
import type { Comment } from "@openwf-mod-manager/shared";
import { fetchComments, postComment } from "../api";
import { getCommenterName, setCommenterName } from "../settings";

// No account system exists in this project (see docs/architecture.md) —
// commenting is open, and authorName is just remembered locally for
// convenience, not verified.
export default function CommentSection({ modId }: { modId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(getCommenterName());
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    fetchComments(modId)
      .then(setComments)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [modId]);

  async function submit() {
    if (!name.trim() || !body.trim()) return;
    setPosting(true);
    try {
      const comment = await postComment(modId, name.trim(), body.trim());
      setComments((c) => [comment, ...c]);
      setCommenterName(name.trim());
      setBody("");
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="comments">
      <h3>Comments</h3>
      <div className="comment-form">
        <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea placeholder="Leave a comment…" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="button" disabled={posting || !name.trim() || !body.trim()} onClick={submit}>
          {posting && <span className="spinner" />}
          {posting ? "Posting…" : "Post comment"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p><span className="spinner" /> Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="muted">No comments yet — be the first.</p>
      ) : (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className="comment fade-in">
              <div className="comment__meta">
                <strong>{c.authorName}</strong>
                <span className="muted">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p className="comment__body">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
