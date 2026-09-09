import { useEffect, useState } from "react";

function ScreenshotThumb({ url }: { url: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    setStatus("loading");
    const img = new Image();
    img.onload = () => setStatus("ok");
    img.onerror = () => setStatus("error");
    img.src = url;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);

  return (
    <div className="screenshot-preview__item">
      {status === "ok" && <img className="screenshot-preview__img" src={url} alt="" />}
      {status === "loading" && <div className="screenshot-preview__placeholder"><span className="spinner" /></div>}
      {status === "error" && <div className="screenshot-preview__placeholder screenshot-preview__placeholder--error">Broken link</div>}
    </div>
  );
}

// One small preview + load check per line of the screenshot URLs field —
// same reasoning as ThumbnailPreview: this app never re-hosts images, so
// a broken link is otherwise invisible until someone opens the mod.
export default function ScreenshotPreviewList({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="screenshot-preview">
      {urls.map((url, i) => (
        <ScreenshotThumb key={`${i}-${url}`} url={url} />
      ))}
    </div>
  );
}
