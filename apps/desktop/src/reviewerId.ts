// A random id generated once per install and persisted in localStorage —
// just enough for the likes API to let this install toggle its own like on
// a mod instead of stacking duplicate rows. Not a real account or
// identity; nothing about it is sent anywhere except alongside a like.

const KEY = "owmm.reviewerId";

export function getReviewerId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
