# E2E test flow: Admin → Distributor → Product approved

Walkthrough of the current Prisma schema from **admin creating a distributor** through **product request approval**, with expected **DB table state** after each step.

**Rule:** Any distributor may select any user with `role = SUPPLIER` when creating a request. No pre-link table.

Fixed demo IDs (for readability):

| Alias | UUID |
|---|---|
| `ADMIN` | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` |
| `DIST` | `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb` |
| `SUP` | `cccccccc-cccc-cccc-cccc-cccccccccccc` |
| `DIST_SETTINGS` | `d1111111-1111-1111-1111-111111111111` |
| `SUP_SETTINGS` | `d2222222-2222-2222-2222-222222222222` |
| `REQ` | `eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee` |
| `DOC_REQ_TR` | `f1111111-1111-1111-1111-111111111111` |
| `DOC_REQ_PI` | `f2222222-2222-2222-2222-222222222222` |
| `FLD_REQ_SN` | `f3333333-3333-3333-3333-333333333333` |
| `FLD_REQ_AG` | `f4444444-4444-4444-4444-444444444444` |
| `DOC_TR` | `a1111111-1111-1111-1111-111111111111` |
| `DOC_PI` | `a2222222-2222-2222-2222-222222222222` |
| `VAL_SN` | `a3333333-3333-3333-3333-333333333333` |
| `VAL_AG` | `a4444444-4444-4444-4444-444444444444` |
| `N1`…`N3` | notification ids |

Legend for empty tables: `∅` = no rows yet.

---

## Step 0 — Baseline (after seed)

Super Admin already exists (seed).

### `users`

| id | name | email | role | createdById |
|---|---|---|---|---|
| `ADMIN` | Super Admin | admin@development.com | `SUPER_ADMIN` | null |

### Other tables

`user_settings` ∅ · `product_requests` ∅ · ask/answer tables ∅ · `notifications` ∅ · `product_messages` ∅

---

## Step 1 — Admin creates a Distributor

**Actor:** `SUPER_ADMIN`  
**Action:** Create user with `role = DISTRIBUTOR`, `createdById = ADMIN`, and a `user_settings` row (defaults).

### `users`

| id | name | email | role | createdById |
|---|---|---|---|---|
| `ADMIN` | Super Admin | admin@development.com | `SUPER_ADMIN` | null |
| `DIST` | Acme Distribution | dist@acme.com | `DISTRIBUTOR` | `ADMIN` |

### `user_settings`

| id | userId | autoApproveProductRequests |
|---|---|---|
| `DIST_SETTINGS` | `DIST` | `false` |

### Unchanged

`product_requests` ∅ · requirements/answers/notifications ∅

---

## Step 2 — Admin (or Distributor) creates a Supplier

**Actor:** `SUPER_ADMIN` (or `DIST`)  
**Action:** Create user with `role = SUPPLIER`, `createdById = ADMIN` (or `DIST`), and `user_settings` (defaults; auto-approve is ignored for suppliers).

### `users`

| id | name | email | role | createdById |
|---|---|---|---|---|
| `ADMIN` | … | … | `SUPER_ADMIN` | null |
| `DIST` | Acme Distribution | dist@acme.com | `DISTRIBUTOR` | `ADMIN` |
| `SUP` | Northwind Supply | supplier@northwind.com | `SUPPLIER` | `ADMIN` |

### `user_settings`

| id | userId | autoApproveProductRequests |
|---|---|---|
| `DIST_SETTINGS` | `DIST` | `false` |
| `SUP_SETTINGS` | `SUP` | `false` |

### Still empty

`product_requests` ∅ · ask/answer ∅ · `notifications` ∅

---

## Step 3 — Distributor creates product request + requirements (and may prefill answers)

**Actor:** `DISTRIBUTOR` (`DIST`)  
**Action:**

1. Select any supplier (`role = SUPPLIER`) — here `SUP`.
2. Insert `product_requests` with `status = PENDING`, `distributorId = DIST`, `supplierId = SUP`.
3. Insert selected **ask** rows.
4. Optionally insert **answer** rows for data the distributor already has (same answer tables the supplier uses).
5. Notify supplier: `REQUEST_CREATED`.

App rule: `supplierId` must reference a user with `role = SUPPLIER` (and typically `distributorId` a `DISTRIBUTOR` / acting admin).

Who fills what is **not** stored in the DB — only whether an answer row exists. Prefill is just creating answer rows at create time.

Example selection + prefill:

| Kind | Key | Level | Visibility | Prefill at create? |
|---|---|---|---|---|
| Doc | `TEST_REPORT` | `REQUIRED` | `PRIVATE` | no — supplier uploads |
| Doc | `PRODUCT_IMAGE` | `OPTIONAL` | `PUBLIC` | yes — distributor attaches |
| Field | `SAFETY_NOTICE_TEXT` | `REQUIRED` | `PUBLIC` | yes — distributor writes |
| Field | `AGE_GRADING` | `OPTIONAL` | `PRIVATE` | no — supplier may fill |

### `product_requests`

| id | name | sku | status | distributorId | supplierId | submittedAt | reviewedAt | isDeleted |
|---|---|---|---|---|---|---|---|---|
| `REQ` | Widget Pro | WP-001 | `PENDING` | `DIST` | `SUP` | null | null | false |

### `product_document_requirements`

| id | productRequestId | type | customKey | label | level | visibility |
|---|---|---|---|---|---|---|
| `DOC_REQ_TR` | `REQ` | `TEST_REPORT` | `""` | null | `REQUIRED` | `PRIVATE` |
| `DOC_REQ_PI` | `REQ` | `PRODUCT_IMAGE` | `""` | null | `OPTIONAL` | `PUBLIC` |

### `product_field_requirements`

| id | productRequestId | fieldType | customKey | label | level | visibility |
|---|---|---|---|---|---|---|
| `FLD_REQ_SN` | `REQ` | `SAFETY_NOTICE_TEXT` | `""` | null | `REQUIRED` | `PUBLIC` |
| `FLD_REQ_AG` | `REQ` | `AGE_GRADING` | `""` | null | `OPTIONAL` | `PRIVATE` |

### Prefill answers (created in the same step)

### `product_documents`

| id | requirementId | fileUrl | fileName |
|---|---|---|---|
| `DOC_PI` | `DOC_REQ_PI` | `https://files.example/product.jpg` | `product.jpg` |

### `product_field_values`

| id | requirementId | value |
|---|---|---|
| `VAL_SN` | `FLD_REQ_SN` | Keep away from children under 3. |

Still missing for submit: `TEST_REPORT` (required). `AGE_GRADING` is optional.

### `notifications`

| id | type | receiverId | creatorId | productRequestId | isRead | title (example) |
|---|---|---|---|---|---|---|
| `N1` | `REQUEST_CREATED` | `SUP` | `DIST` | `REQ` | false | New compliance request |

---

## Step 4 — Supplier fills remaining answers (still PENDING)

**Actor:** `SUPPLIER` (`SUP`)  
**Action:** Upsert answer rows only for items still empty (linked by `requirementId`).

Distributor-prefilled rows stay as-is unless the supplier is allowed to overwrite them in the API (product decision; schema allows upsert either way).

Visibility for public pages is read from the **requirement** row (document or field) — not stored on answer rows.

### `product_documents` (after supplier upload)

| id | requirementId | fileUrl | fileName |
|---|---|---|---|
| `DOC_PI` | `DOC_REQ_PI` | `https://files.example/product.jpg` | `product.jpg` |
| `DOC_TR` | `DOC_REQ_TR` | `https://files.example/test-report.pdf` | `test-report.pdf` |

### `product_field_values` (after supplier fill)

| id | requirementId | value |
|---|---|---|
| `VAL_SN` | `FLD_REQ_SN` | Keep away from children under 3. |
| `VAL_AG` | `FLD_REQ_AG` | 3+ |

### `product_requests`

Unchanged: `status = PENDING`, `submittedAt = null`

### Ask tables

Unchanged (still define what was requested).

---

## Step 5 — Supplier submits

**Actor:** `SUPPLIER`  
**App validation before status change:**

- Every `REQUIRED` document requirement has a `product_documents` row with non-empty `fileUrl`
- Every `REQUIRED` field requirement has a `product_field_values` row with non-empty `value`
- Prefills count: `SAFETY_NOTICE_TEXT` already satisfied from Step 3; `TEST_REPORT` satisfied from Step 4
- `OPTIONAL` items may be missing (here both optionals were filled — also fine)

**Action (manual-approve path — default):**  
Read `user_settings` for the request’s `distributorId`. Here `autoApproveProductRequests = false`, so set `status = SUBMITTED`, `submittedAt = now()`, notify distributor `REQUEST_SUBMITTED`.

### `product_requests` (delta)

| id | status | submittedAt | reviewedAt |
|---|---|---|---|
| `REQ` | `SUBMITTED` | `2026-09-04T12:00:00Z` | null |

### `notifications` (added)

| id | type | receiverId | creatorId | productRequestId | isRead |
|---|---|---|---|---|---|
| `N1` | `REQUEST_CREATED` | `SUP` | `DIST` | `REQ` | true/false |
| `N2` | `REQUEST_SUBMITTED` | `DIST` | `SUP` | `REQ` | false |

### Answer tables

Unchanged from Step 4.

---

## Step 6 — Distributor approves

**Actor:** `DISTRIBUTOR` (`DIST`)  
**Action:** Set `status = APPROVED`, set `reviewedAt = now()`, clear `rejectionReason` if any, notify supplier.

### `product_requests` (final)

| id | name | sku | status | distributorId | supplierId | submittedAt | reviewedAt | rejectionReason | isDeleted |
|---|---|---|---|---|---|---|---|---|---|
| `REQ` | Widget Pro | WP-001 | `APPROVED` | `DIST` | `SUP` | `2026-09-04T12:00:00Z` | `2026-09-04T13:00:00Z` | null | false |

### `notifications` (full)

| id | type | receiverId | creatorId | productRequestId | isRead |
|---|---|---|---|---|---|
| `N1` | `REQUEST_CREATED` | `SUP` | `DIST` | `REQ` | … |
| `N2` | `REQUEST_SUBMITTED` | `DIST` | `SUP` | `REQ` | … |
| `N3` | `REQUEST_APPROVED` | `SUP` | `DIST` | `REQ` | false |

---

## Final DB snapshot (happy path — manual approve)

```text
users
  ADMIN (SUPER_ADMIN)
  DIST  (DISTRIBUTOR)  createdBy ADMIN
  SUP   (SUPPLIER)     createdBy ADMIN

user_settings
  DIST_SETTINGS  autoApproveProductRequests=false
  SUP_SETTINGS   autoApproveProductRequests=false

product_requests
  REQ: PENDING → SUBMITTED → APPROVED
       distributorId=DIST, supplierId=SUP

product_document_requirements
  DOC_REQ_TR  TEST_REPORT   REQUIRED  PRIVATE
  DOC_REQ_PI  PRODUCT_IMAGE OPTIONAL  PUBLIC

product_field_requirements
  FLD_REQ_SN  SAFETY_NOTICE_TEXT REQUIRED  PUBLIC
  FLD_REQ_AG  AGE_GRADING        OPTIONAL  PRIVATE

product_documents
  DOC_PI → DOC_REQ_PI (prefilled by distributor at create)
  DOC_TR → DOC_REQ_TR (uploaded by supplier)

product_field_values
  VAL_SN → FLD_REQ_SN (prefilled by distributor at create)
  VAL_AG → FLD_REQ_AG (filled by supplier)

notifications
  N1 REQUEST_CREATED   → SUP
  N2 REQUEST_SUBMITTED → DIST
  N3 REQUEST_APPROVED  → SUP

product_messages          ∅ (optional side path)
refresh_tokens            (auth only; not part of this flow)
```

---

## Alternate branch A — Distributor enables auto-approve

Before Step 3 (or any time), distributor updates settings:

### `user_settings` (delta)

| id | userId | autoApproveProductRequests |
|---|---|---|
| `DIST_SETTINGS` | `DIST` | `true` |

Then Steps 3–4 are the same. At **Step 5 (submit)**:

**Action (auto-approve path):**  
Validation passes → set `status = APPROVED`, `submittedAt = now()`, `reviewedAt = now()`, skip manual Step 6.

Notifications on submit:

| id | type | receiverId | creatorId | productRequestId | note |
|---|---|---|---|---|---|
| `N2` | `REQUEST_SUBMITTED` | `DIST` | `SUP` | `REQ` | optional audit ping |
| `N3` | `REQUEST_APPROVED` | `SUP` | `SUP` or system/`DIST` | `REQ` | supplier sees approval |

Suggested app policy: emit both `REQUEST_SUBMITTED` (to distributor) and `REQUEST_APPROVED` (to supplier), with `creatorId` = supplier (actor who submitted) or distributor (owner of the setting). Pick one convention in the API layer.

### `product_requests` after auto-approve submit

| id | status | submittedAt | reviewedAt |
|---|---|---|---|
| `REQ` | `APPROVED` | `2026-09-04T12:00:00Z` | `2026-09-04T12:00:00Z` |

`autoApproveProductRequests` is only applied when the request’s distributor has it enabled; suppliers’ setting value is ignored for this feature.

---

## Alternate branch B — Reject then reopen (optional)

If Step 6 were **reject** instead of approve:

1. `product_requests.status = REJECTED`, `rejectionReason = "…"`, `reviewedAt = now()`, notify `REQUEST_REJECTED` → `SUP`.
2. Distributor **edits requirements** (e.g. add `CERTIFICATE` REQUIRED):
   - Upsert/delete rows in ask tables
   - Set `status = PENDING`, `requirementsUpdatedAt = now()`, clear `rejectionReason`
   - Cascade deletes answers tied to removed requirements (`requirementId` FK)
   - Notify `REQUEST_REQUIREMENTS_UPDATED` → `SUP`
3. Supplier fills again → submit → approve (Steps 4–6), or auto-approve if settings allow.

Visibility-only change on an existing requirement does **not** require reopen (app rule).

---

## Integrity checks to assert in an automated test

1. Creating a request only needs `distributorId` + `supplierId` (supplier must be `role = SUPPLIER` — app validation).
2. Answer rows cannot exist without a requirement (`requirementId` FK, unique 1:1).
3. Distributor/admin may create answer rows at request-create time; submit treats them like any other answer.
4. Each user has at most one `user_settings` row (`userId` unique).
5. When distributor `autoApproveProductRequests = true` and submit validates, request becomes `APPROVED` with both `submittedAt` and `reviewedAt` set.
6. Deleting a requirement cascades its document/value.
7. OTHER ask rows reject empty `customKey` / missing `label` (DB CHECK).
8. Built-in ask rows require `customKey = ''`.
9. Soft-deleted request can free the same `sku` for a new active row (partial unique index).
10. Notifications are user-inbox based (`receiverId`); `productRequestId` is optional context only.

---

## Suggested automated test shape (later)

```text
e2e/product-approval.flow.spec.ts
  1. seed/login as SUPER_ADMIN
  2. create distributor + supplier (+ user_settings defaults)
  3. as DIST: create request + requirements + prefill some answers → assert PENDING + N1 + partial answers
  4. as SUP: fill remaining answers → assert full answer set, still PENDING
  5. as SUP: submit → assert SUBMITTED + submittedAt + N2
  6. as DIST: approve → assert APPROVED + reviewedAt + N3
  7. (separate case) enable autoApprove on DIST → submit → assert APPROVED without manual step
  8. snapshot query each table (or assert counts + key columns)
```

API endpoints for this flow are not fully implemented yet; this doc is the **schema-level contract** those endpoints must satisfy.
