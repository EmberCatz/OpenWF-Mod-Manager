import { useEffect, useState } from "react";
import type { Comment } from "@openwf-mod-manager/shared";
import { deleteCommentAdmin, fetchComments, postComment } from "../api";
import { getApiKey, getCommenterName, setCommenterName } from "../settings";
import { useAccount } from "../useAccount";
import { TrashIcon } from "../icons";
import ReportButton from "./ReportButton";

// No account system exists in this project (see docs/architecture.md) —
// commenting is open, and authorName is just remembered locally for
// convenience, not verified.
export default function CommentSection({ modId }: { modId: string }) {
  const { account } = useAccount();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(getCommenterName());
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  async function handleAdminDelete(commentId: number) {
    const apiKey = getApiKey();
    if (!apiKey) return;
    setDeletingId(commentId);
    try {
      await deleteCommentAdmin(modId, commentId, apiKey);
      setComments((c) => c.filter((x) => x.id !== commentId));
    } catch (e) {
      setError(String(e));
    } finally {
      setDeletingId(null);
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
              <ReportButton targetType="comment" targetId={String(c.id)} />
              {account?.isAdmin && (
                <button
                  className="button button--danger comment__admin-delete"
                  disabled={deletingId === c.id}
                  onClick={() => handleAdminDelete(c.id)}
                >
                  <TrashIcon className="btn-icon" /> Delete (admin)
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
