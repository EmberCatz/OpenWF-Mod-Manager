import { useState } from "react";
import { submitReport } from "../api";
import { toast } from "../toast";

interface ReportButtonProps {
  targetType: "mod" | "comment";
  targetId: string;
}

// No review queue in the app itself — this just files a report the
// operator checks directly (see apps/api/package.json's "reports:list"
// script). Deliberately minimal: a reason, a submit button, done.
export default function ReportButton({ targetType, targetId }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "done">("idle");

  async function submit() {
    if (!reason.trim()) return;
    setStatus("working");
    try {
      await submitReport(targetType, targetId, reason.trim());
      setStatus("done");
    } catch (e) {
      toast.error(String(e));
      setStatus("idle");
    }
  }

  if (status === "done") {
    return <span className="muted report-button__done">Reported — thanks.</span>;
  }

  if (!open) {
    return (
      <button className="report-button__toggle" onClick={() => setOpen(true)}>
        Report
      </button>
    );
  }

  return (
    <div className="report-form">
      <textarea
        placeholder="What's wrong with this?"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
      />
      <div className="field__row">
        <button className="button" disabled={status === "working" || !reason.trim()} onClick={submit}>
          {status === "working" && <span className="spinner" />}
          Submit report
        </button>
        <button className="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
