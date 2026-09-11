// Reddit-style up/down arrow pair with a net score between them. Clicking
// the currently-active direction again un-votes (value 0) rather than
// toggling straight to the opposite — same "click again to undo" behavior
// as StarRating's click-to-rate.
export default function VoteControl({
  score,
  myVote,
  disabled,
  onVote,
}: {
  score: number;
  myVote: -1 | 0 | 1;
  disabled?: boolean;
  onVote: (value: -1 | 0 | 1) => void;
}) {
  return (
    <div className="vote-control">
      <button
        className={`vote-control__btn ${myVote === 1 ? "vote-control__btn--up-active" : ""}`}
        disabled={disabled}
        aria-label="Upvote"
        onClick={() => onVote(myVote === 1 ? 0 : 1)}
      >
        ▲
      </button>
      <span className="vote-control__score">{score}</span>
      <button
        className={`vote-control__btn ${myVote === -1 ? "vote-control__btn--down-active" : ""}`}
        disabled={disabled}
        aria-label="Downvote"
        onClick={() => onVote(myVote === -1 ? 0 : -1)}
      >
        ▼
      </button>
    </div>
  );
}
