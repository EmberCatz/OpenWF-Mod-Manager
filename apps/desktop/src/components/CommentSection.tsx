import { useEffect, useMemo, useRef, useState } from "react";
import type { Comment } from "@openwf-mod-manager/shared";
import { deleteCommentAdmin, fetchComments, postComment, voteOnComment } from "../api";
import { getApiKey, getCommenterName, setCommenterName } from "../settings";
import { getReviewerId } from "../reviewerId";
import { useAccount } from "../useAccount";
import { TrashIcon } from "../icons";
import { toast } from "../toast";
import AuthorLink from "./AuthorLink";
import VoteControl from "./VoteControl";
import ReportButton from "./ReportButton";

type SortKey = "newest" | "oldest" | "top";
const SORT_LABELS: Record<SortKey, string> = { newest: "Newest", oldest: "Oldest", top: "Top" };
const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];

// Coerces whatever the API actually sent into the shape this component
// relies on — an older/un-migrated deployment won't include parentId,
// score, myVote, or authorAccountId at all, and leaving those as
// `undefined` breaks the tree grouping (see childrenByParent below) and
// turns score math into NaN instead of just degrading gracefully to a
// flat, unvoted list.
function normalizeComment(c: Comment): Comment {
  return {
    ...c,
    parentId: typeof c.parentId === "number" ? c.parentId : null,
    authorAccountId: c.authorAccountId ?? null,
    score: typeof c.score === "number" ? c.score : 0,
    myVote: c.myVote === 1 || c.myVote === -1 ? c.myVote : 0,
  };
}

interface CommentNodeProps {
  comment: Comment;
  depth: number;
  childrenByParent: Map<number | null, Comment[]>;
  replyingToId: number | null;
  setReplyingToId: (id: number | null) => void;
  posting: boolean;
  onSubmitReply: (parentId: number, authorName: string, body: string, onDone: () => void) => void;
  onVote: (commentId: number, value: -1 | 0 | 1) => void;
  isAdmin: boolean;
  deletingId: number | null;
  onAdminDelete: (commentId: number) => void;
}

// A single comment plus its replies, recursively — hoisted to module scope
// (rather than defined inside CommentSection) so it isn't torn down and
// recreated as a "new" component on every re-render, which would otherwise
// blow away any reply draft someone's mid-typing whenever unrelated state
// changes (a vote elsewhere, a new top-level comment arriving, etc).
function CommentNode({
  comment,
  depth,
  childrenByParent,
  replyingToId,
  setReplyingToId,
  posting,
  onSubmitReply,
  onVote,
  isAdmin,
  deletingId,
  onAdminDelete,
}: CommentNodeProps) {
  const [replyName, setReplyName] = useState(getCommenterName());
  const [replyBody, setReplyBody] = useState("");
  const isReplying = replyingToId === comment.id;
  const kids = childrenByParent.get(comment.id) ?? [];

  return (
    <li className="comment fade-in" style={{ marginLeft: depth * 1.5 + "rem" }}>
      <div className="comment__meta">
        <VoteControl score={comment.score} myVote={comment.myVote} onVote={(v) => onVote(comment.id, v)} />
        <AuthorLink name={comment.authorName} accountId={comment.authorAccountId} className="comment__author" />
        <span className="muted">{new Date(comment.createdAt).toLocaleString()}</span>
      </div>
      <p className="comment__body">{comment.body}</p>
      <div className="comment__actions">
        <button className="comment__reply-toggle" onClick={() => setReplyingToId(isReplying ? null : comment.id)}>
          {isReplying ? "Cancel" : "Reply"}
        </button>
        <ReportButton targetType="comment" targetId={String(comment.id)} />
        {isAdmin && (
          <button
            className="button button--danger comment__admin-delete"
            disabled={deletingId === comment.id}
            onClick={() => onAdminDelete(comment.id)}
          >
            <TrashIcon className="btn-icon" /> Delete (admin)
          </button>
        )}
      </div>

      {isReplying && (
        <div className="comment-form comment-form--reply">
          <input type="text" placeholder="Your name" value={replyName} onChange={(e) => setReplyName(e.target.value)} />
          <textarea placeholder="Write a reply…" rows={2} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} />
          <button
            className="button"
            disabled={posting || !replyName.trim() || !replyBody.trim()}
            onClick={() =>
              onSubmitReply(comment.id, replyName, replyBody, () => {
                setReplyBody("");
                setReplyingToId(null);
              })
            }
          >
            {posting && <span className="spinner" />}
            Post reply
          </button>
        </div>
      )}

      {kids.length > 0 && (
        <ul className="comment-list comment-list--nested">
          {kids.map((k) => (
            <CommentNode
              key={k.id}
              comment={k}
              depth={depth + 1}
              childrenByParent={childrenByParent}
              replyingToId={replyingToId}
              setReplyingToId={setReplyingToId}
              posting={posting}
              onSubmitReply={onSubmitReply}
              onVote={onVote}
              isAdmin={isAdmin}
              deletingId={deletingId}
              onAdminDelete={onAdminDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// Comments still don't require an account to post (see docs/architecture.md)
// — authorName is whatever the commenter typed, not a verified identity.
// authorAccountId is a best-effort match the server resolves by name, used
// only to make the name a profile link when one happens to exist (see
// AuthorLink.tsx). Voting reuses the same anonymous per-install reviewerId
// star ratings already use — one vote per install, not per account.
export default function CommentSection({ modId }: { modId: string }) {
  const { account } = useAccount();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(getCommenterName());
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  // Per-comment request counter for handleVote — lets an in-flight vote
  // request recognize it's been superseded by a newer click on the same
  // comment, so a slow response can't land after a faster later one and
  // clobber it back to a stale score/myVote (see handleVote below).
  const voteSeqRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    fetchComments(modId, getReviewerId())
      .then((cs) => setComments(cs.map(normalizeComment)))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [modId]);

  const childrenByParent = useMemo(() => {
    const map = new Map<number | null, Comment[]>();
    for (const c of comments) {
      // Normalized rather than keyed on the raw value: an API that doesn't
      // send parentId at all (an older deployment that predates threading)
      // would otherwise group every comment under the key `undefined`
      // instead of `null`, and the roots lookup below — which specifically
      // asks for `null` — would come back empty, making every comment
      // vanish instead of just falling back to a flat list.
      const key = typeof c.parentId === "number" ? c.parentId : null;
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    // Replies always read oldest-first within a thread, regardless of the
    // top-level sort — only the root list's order changes below.
    for (const list of map.values()) list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return map;
  }, [comments]);

  const roots = useMemo(() => {
    const list = [...(childrenByParent.get(null) ?? [])];
    switch (sortKey) {
      case "newest":
        return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case "oldest":
        return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case "top":
        return list.sort((a, b) => b.score - a.score);
    }
  }, [childrenByParent, sortKey]);

  async function submit(parentId: number | null, authorName: string, commentBody: string, onDone: () => void) {
    if (!authorName.trim() || !commentBody.trim()) return;
    setPosting(true);
    try {
      const comment = await postComment(modId, authorName.trim(), commentBody.trim(), parentId, (await getApiKey()) ?? undefined);
      setComments((c) => [...c, normalizeComment(comment)]);
      setCommenterName(authorName.trim());
      onDone();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPosting(false);
    }
  }

  async function handleVote(commentId: number, value: -1 | 0 | 1) {
    // Optimistic — voting is low-stakes and this keeps the arrows feeling
    // instant; a failure just restores the previous state (a reload would
    // pick up the truth either way). Guarded against out-of-order network
    // responses: a rapid second vote on the same comment bumps its
    // sequence number, so if the FIRST request's response (success or
    // error) arrives after the second one fired, it recognizes it's stale
    // and does nothing instead of clobbering the newer optimistic/
    // confirmed state back to a value the user already moved past.
    const seq = (voteSeqRef.current.get(commentId) ?? 0) + 1;
    voteSeqRef.current.set(commentId, seq);
    const isCurrent = () => voteSeqRef.current.get(commentId) === seq;

    const prev = comments;
    const prevVote = prev.find((c) => c.id === commentId)?.myVote ?? 0;
    setComments((cs) => cs.map((c) => (c.id === commentId ? { ...c, myVote: value, score: c.score - prevVote + value } : c)));
    try {
      const result = await voteOnComment(modId, commentId, getReviewerId(), value);
      if (!isCurrent()) return;
      setComments((cs) => cs.map((c) => (c.id === commentId ? { ...c, score: result.score, myVote: result.myVote } : c)));
    } catch (e) {
      if (!isCurrent()) return;
      setComments(prev);
      toast.error(String(e));
    }
  }

  async function handleAdminDelete(commentId: number) {
    const apiKey = await getApiKey();
    if (!apiKey) return;
    setDeletingId(commentId);
    try {
      await deleteCommentAdmin(modId, commentId, apiKey);
      // The route deletes the whole reply subtree server-side — drop every
      // descendant locally too instead of refetching.
      const toRemove = new Set([commentId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const c of comments) {
          if (c.parentId != null && toRemove.has(c.parentId) && !toRemove.has(c.id)) {
            toRemove.add(c.id);
            grew = true;
          }
        }
      }
      setComments((cs) => cs.filter((c) => !toRemove.has(c.id)));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="comments">
      <div className="comments__header">
        <h3>Comments</h3>
        {comments.length > 0 && (
          <select className="browse-toolbar__sort comment-sort" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                Sort: {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="comment-form">
        <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea placeholder="Leave a comment…" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="button" disabled={posting || !name.trim() || !body.trim()} onClick={() => submit(null, name, body, () => setBody(""))}>
          {posting && <span className="spinner" />}
          {posting ? "Posting…" : "Post comment"}
        </button>
        <span className="hint">Links aren't allowed, and a basic profanity filter applies.</span>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p><span className="spinner" /> Loading comments…</p>
      ) : roots.length === 0 ? (
        <p className="muted">No comments yet — be the first.</p>
      ) : (
        <ul className="comment-list">
          {roots.map((c) => (
            <CommentNode
              key={c.id}
              comment={c}
              depth={0}
              childrenByParent={childrenByParent}
              replyingToId={replyingToId}
              setReplyingToId={setReplyingToId}
              posting={posting}
              onSubmitReply={submit}
              onVote={handleVote}
              isAdmin={!!account?.isAdmin}
              deletingId={deletingId}
              onAdminDelete={handleAdminDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
