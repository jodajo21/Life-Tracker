# Product spec vs. implementation

## Decisions where the spec pulled in two directions
| Spec says | Built as |
|---|---|
| Misses cost a little, but never wipe progress, and no guilt | XP only goes up. A separate 7-dot **momentum** meter dips gently after 2+ missed days. Rest days, Sundays (Home) and **soft days** are free |
| Variable rewards, but never hide whether a log counted | Base XP every time; ~10% lucky bonus. Each roll is stored, shown in the XP list, and the odds are stated in the app. Box rolls are seeded so re-checking can't farm them |
| Sparse reminder, only if boxes are open, no push spam | Shortcuts automation hitting `/api/today?plain=1` (empty body = nothing to say). No web-push infrastructure |
| Siri "Snap checklist" / `?voice=1` deep links | Shortcut posts the photo to `/api/photo?plain=1`; deep links open the + sheet with the mic/camera button ready, because browsers require a tap |
| Chat cites charts + one tiny next move, no review ritual | Chat tool `show_chart` renders real charts from queries; "Tiny move:" only if natural; prompt forbids lecturing/weekly routines |

## Gap list (scaffold → spec) and status
| # | Gap | Status |
|---|---|---|
| 1 | Open on Today with last-used domain chip; big + (voice/photo first); stay on Today after logging | Done |
| 2 | Offline queue + sync (idempotent retries) | Done: IndexedDB queue, `client_id` replay, phone-local date |
| 3 | ⌘K quick-add; `?voice=1` / `?snap=1` | Done |
| 4 | Photo checkboxes: instant feedback, pulse last open box | Done (auto-apply when sure, confirm sheet otherwise) |
| 5 | Card generator: cadences, 3–6/card, weak zones bias next batch | Done (boost +1 occurrence for rooms <60% last set, toggleable) |
| 6 | XP seasons, lucky drops, shards → room trophies, discovery, comeback, shields | Done |
| 7 | Near-miss UI (X of Y · Z left, room heat ≥70%, chat can cite it) | Done |
| 8 | House map | Done as a room-tile grid (not a real floor plan) |
| 9 | Time scales day/week/month/3 months | Done (+ year) |
| 10 | Chat with charts | Done |
| 11 | Siri: "Log habit", "Snap checklist" | Shortcut recipes in README (must be built on the phone) |
| 12 | Opt-in reminder | Shortcuts automation (no push) |
| 13 | Deploy | **Blocked** until the environment allows api.cloudflare.com and holds the secrets (see end of README / chat) |

## Not built (deliberately)
Weekly boss fight / forced review, infinite feed, countdown timers, streak-loss copy, push notifications, multi-user.
