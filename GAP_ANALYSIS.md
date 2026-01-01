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
| **User Profile** | ✅ FIXED | ✅ Real data | Public profile API implemented with stats/badges |
| **Artifact Viewer** | API hooks exist | Uses mock artifact | `useArtifact()` unused, mock data instead |
| **Match Comparison/Diff** | Returns mock | Uses mock comparison | `useMatchComparison()` returns mock |
| **File Content Preview** | Returns mock content | Fake file content | API returns mock based on extension |
| **Code Submission** | Presigned URLs mock | Button exists, no handler | "Submit Code" button has no onClick |

---

## STUB / NOT IMPLEMENTED

| Spec Feature | Status | Details |
|--------------|--------|---------|
| **Profile Editing** | ✅ COMPLETE | Dialog with display name and avatar URL editing |
| **Transaction Export** | ✅ COMPLETE | Export button downloads CSV with all transactions |
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
| **Judging Results Display** | ✅ Complete - UI with scores/breakdown implemented |
| **Dispute Creation (User)** | No "Open Dispute" UI for users |
| **Prize Claims Flow** | ✅ Complete - Claim UI for tournament winners |
| **Prize Fulfillment Admin** | ✅ Complete - Admin prize approval/fulfillment |
| **Moderation Actions** | No admin sanction/ban UI |
| **Audit Log Explorer** | ✅ Complete - Admin audit log UI with filters/export |
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

## Critical Path Issues (Updated 2025-12-31)

### 1. Auth Context - PARTIALLY FIXED ✓
- ✅ Profile page now uses `useAuthStore()` properly
- ✅ Profile page correctly determines `isOwnProfile` via auth
- ⚠️ Match details may still need auth context check
- ⚠️ Tournament registration state needs verification

### 2. Match Join Flow - FIXED ✓
- ✅ Challenge detail page has "Sign in to Compete" button
- ✅ Challenge cards link to detail pages with competition options
- ⚠️ Invite link generation UI may still be missing

### 3. Submission Flow
- ✅ Multipart resumable upload with S3 presigned URLs implemented (QUI-100)
- ⚠️ Web submission UI integration needs verification
- ✅ Extension submission works

### 4. Judging Results - FIXED ✓
- ✅ Judging results UI with detailed breakdown implemented (QUI-110)
- ✅ Scoring engine with rubric evaluation (QUI-107)
- ✅ Tie-breaker logic with explanations (QUI-109)

---

## Summary by Phase (from Spec) - Updated 2025-12-31

| Phase | Status | Completion |
|-------|--------|------------|
| Phase 1: Foundation | Complete | ~98% |
| Phase 2: Identity & Auth | Complete (Google OAuth, session mgmt, RBAC) | ~95% |
| Phase 3: Challenges | Complete | ~98% |
| Phase 4: Match Engine | Complete (SSE real-time, state machine) | ~90% |
| Phase 5: Submissions | Multipart upload done | ~85% |
| Phase 6: Judging | Complete (scoring, tie-breakers, results UI) | ~90% |
| Phase 7: Credits Wallet | Complete | ~95% |
| Phase 8: Rankings/Disputes | Complete (leaderboard, disputes) | ~85% |
| Phase 9: Tournaments | Prize claims added | ~75% |
| Phase 10: Automation Services | Not started | 0% |
| Phase 11: Production Hardening | Rate limiting, GDPR done | ~60% |

---

## Priority Fixes (Updated)

1. ~~Wire auth context~~ - DONE for profile page
2. ~~Add "Join Match" button~~ - DONE ("Sign in to Compete")
3. ~~Build judging results UI~~ - DONE
4. **Phase 10: Automation Services** - Not started
5. **Production hardening** - Continue pen testing, load testing
