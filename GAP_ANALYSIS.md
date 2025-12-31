# RepoRivals: Spec vs Implementation Gap Analysis

## Executive Summary

The codebase has a **solid foundation** with most infrastructure in place. However, there are significant gaps between what's implemented in the backend, what's exposed in the UI, and what the spec requires.

---

## FULLY WIRED (Backend + UI Complete)

| Feature | Backend | UI | Notes |
|---------|---------|-----|-------|
| **Challenge Discovery** | Real DB queries | Filters, pagination | Complete |
| **Matches List** | Real DB queries | Filters, pagination | Complete |
| **Leaderboard** | Glicko-2 ratings | Season filters, search | Complete |
| **Wallet Balance** | Real DB queries | Balance, holds display | Complete |
| **Credit Purchases** | Stripe integration | Package selection, checkout | Complete |
| **Transaction History** | Real DB queries | Filters, pagination | Export is stub |
| **Tournaments List** | Real DB queries | Filters, pagination | Complete |
| **Admin Challenge CRUD** | Full CRUD | Form, versioning, publish | Complete |
| **Admin Disputes** | Review, resolve, rejudge | List, detail, actions | Complete |
| **VS Code Auth** | Device code flow | Status bar, commands | Complete |
| **VS Code Match Events** | SSE streaming | Real-time updates | Complete |

---

## PARTIALLY WIRED (Backend exists, UI gaps)

| Feature | Backend Status | UI Status | Gap |
|---------|---------------|-----------|-----|
| **Match Details** | Real queries | Uses `MOCK_USER_ID` | Current user detection not wired to auth |
| **Match Ready/Forfeit** | API works | Buttons exist | Buttons use mock user ID |
| **Tournament Details** | Real queries | `isRegistered = false` hardcoded | Registration state not from auth |
| **Tournament Registration** | API works | Hooks exist | Button disabled, not wired |
| **Join Match Queue** | API works | No UI trigger | Challenge cards don't have "Join" button |
| **Create Invite Match** | API works | No UI | No invite match creation flow |
| **Match History Fetch** | API endpoint exists | Extension doesn't call it | History provider is empty |

---

## UI ONLY (Mock Data / Not Wired)

| Feature | Backend Status | UI Status | Issue |
|---------|---------------|-----------|-------|
| **User Profile** | API hooks exist | Uses extensive mock data | Lines 39-189 hardcoded mock data |
| **Artifact Viewer** | API hooks exist | Uses mock artifact | `useArtifact()` unused, mock data instead |
| **Match Comparison/Diff** | Returns mock | Uses mock comparison | `useMatchComparison()` returns mock |
| **File Content Preview** | Returns mock content | Fake file content | API returns mock based on extension |
| **Code Submission** | Presigned URLs mock | Button exists, no handler | "Submit Code" button has no onClick |

---

## STUB / NOT IMPLEMENTED

| Spec Feature | Status | Details |
|--------------|--------|---------|
| **Profile Editing** | STUB | Dialog shows "coming soon" |
| **Transaction Export** | STUB | Button exists, no handler |
| **GitHub Repo Submission** | MOCK | API returns mock GitHub metadata |
| **Real S3 Presigned URLs** | MOCK | Returns placeholder URLs |
| **Secret Scan on Upload** | MOCK | Returns mock scan result |
| **Ladder/Round Robin Brackets** | THROW | Throws "not implemented" |
| **Timer Scheduling** | PLACEHOLDER | Uses `setTimeout` instead of BullMQ |
| **Dynamic Stake Amount** | HARDCODED | Returns fixed 100 credits |

---

## MISSING FROM SPEC (Not Started)

### Core Features Not Built

| Spec Requirement | Status |
|-----------------|--------|
| **Judging Results Display** | No UI for viewing scores/breakdown |
| **Dispute Creation (User)** | No "Open Dispute" UI for users |
| **Prize Claims Flow** | No claim UI for tournament winners |
| **Prize Fulfillment Admin** | No admin prize approval/fulfillment |
| **Moderation Actions** | No admin sanction/ban UI |
| **Audit Log Explorer** | No admin audit log UI |
| **Runner Image Management** | No admin UI for judge images |
| **Template Management** | No admin template upload UI |

### Automation Services (Phase 10)

| Service | Status |
|---------|--------|
| Batch Runs | Not started |
| Evaluation Pipelines | Not started |
| CI Checks | Not started |
| Multi-Model Comparison | Not started |
| Agent Jobs | Not started |
| Credit Redemption for Services | Not started |

### VS Code Extension Gaps

| Feature | Status |
|---------|--------|
| GitHub Repo Submission | No UI |
| Template Download | No command |
| Rating/Rank Display | Not shown |
| Invite Match Creation | No UI |
| Tournament Joining | No UI |

---

## Critical Path Issues

### 1. Auth Context Not Wired
The biggest gap across the UI is that **current user detection is mocked**:
- Match details uses `MOCK_USER_ID`
- Tournament registration uses `isRegistered = false`
- Profile page uses `isOwnProfile = true`

**Fix needed:** Wire `useAuth()` or auth context into these components.

### 2. Match Join Flow Broken
Users cannot actually join matches from the web:
- Challenge cards don't have a "Join Queue" button
- No invite link generation UI
- No "Quick Match" button anywhere

### 3. Submission Flow Not Wired
The complete submission flow exists in code but isn't connected:
- Match detail page has a "Submit Code" button with no handler
- Extension submission works, but web submission doesn't

### 4. Judging Results Not Displayed
After a match is judged:
- No scores breakdown UI
- No winner announcement UI
- No detailed rubric results

---

## Summary by Phase (from Spec)

| Phase | Status | Completion |
|-------|--------|------------|
| Phase 1: Foundation | Complete | ~95% |
| Phase 2: Identity & Auth | Backend done, UI gaps | ~80% |
| Phase 3: Challenges | Complete | ~95% |
| Phase 4: Match Engine | Backend done, UI gaps | ~70% |
| Phase 5: Submissions | Mocked S3/GitHub | ~60% |
| Phase 6: Judging | Backend done, no results UI | ~50% |
| Phase 7: Credits Wallet | Complete | ~90% |
| Phase 8: Rankings/Disputes | Leaderboard done, dispute UI missing | ~60% |
| Phase 9: Tournaments | Basic done, prize claims missing | ~50% |
| Phase 10: Automation Services | Not started | 0% |
| Phase 11: Production Hardening | Observability started | ~30% |

---

## Priority Fixes

1. **Wire auth context** to match details, tournaments, profile pages
2. **Add "Join Match" button** to challenge cards
3. **Wire submission button** on match detail page
4. **Build judging results UI** for match completion
5. **Replace mock data** in profile, artifacts, and comparison views
6. **Connect real S3 presigned URLs** for file uploads
