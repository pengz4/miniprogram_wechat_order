# OpenID Helper Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a temporary “Get My OpenID” path in the notify page so the user can obtain their own OpenID during real-device debugging and initialize `WECHAT_ADMIN_OPENIDS`.

**Architecture:** Keep the current notify page as the entry point. Add one temporary backend endpoint at `POST /wechat/debug-openid` that reuses the existing `exchangeCodeForOpenId(code)` path, and update the mini program request layer so notify-page logic can distinguish admin-init `403` responses from general request failures.

**Tech Stack:** WeChat Mini Program, Node.js built-ins, existing HTTP backend, node:test

---

## File Structure

- Modify: `backend/server.js` — add the temporary OpenID lookup endpoint and keep existing admin flows unchanged.
- Modify: `backend/server.test.js` — add focused tests for the temporary endpoint behavior if the server exports need slight expansion.
- Modify: `miniprogram/utils/request.js` — surface response status code on rejected requests without changing success behavior.
- Create: `miniprogram/utils/request.test.js` — verify request failure objects preserve message and carry `statusCode`.
- Create: `miniprogram/pages/notify/state.js` — hold small pure helpers for notify-page init-state decisions and copy-result messaging.
- Create: `miniprogram/pages/notify/state.test.js` — verify the 403 init-state and copy-result helper behavior.
- Modify: `miniprogram/pages/notify/index.js` — add the OpenID helper action, use the state helpers, clipboard handling, and keep existing bind/subscribe flows.
- Modify: `miniprogram/pages/notify/index.wxml` — render the helper button and init guidance, and hide admin-only actions during the 403 init state.

## Chunk 1: Temporary OpenID helper flow

### Task 1: Add backend OpenID lookup endpoint

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/server.test.js`

- [ ] **Step 1: Write the failing test**

Add tests in `backend/server.test.js` for both helper and route contracts:

```js
test('temporary openid lookup rejects missing code', async () => {
  const result = validateDebugOpenIdPayload({});
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.error, 'code is required.');
});

test('temporary openid lookup reports missing WeChat credentials', async () => {
  const result = await lookupOpenIdForDebug('mock-code', async () => {
    throw new Error('缺少微信小程序 AppID 或 AppSecret。');
  });
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.error, '缺少微信小程序 AppID 或 AppSecret。');
});

test('temporary openid lookup returns openid for valid code', async () => {
  const openid = await lookupOpenIdForDebug('mock-code', async () => 'op_test_user');
  assert.deepEqual(openid, { statusCode: 200, body: { openid: 'op_test_user' } });
});

test('POST /wechat/debug-openid returns 400 for missing code', async () => {
  const server = createServer({ exchangeCodeForOpenId: async () => 'unused' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/wechat/debug-openid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const data = await response.json();
  server.close();
  assert.equal(response.status, 400);
  assert.equal(data.error, 'code is required.');
});

test('POST /wechat/debug-openid returns JSON openid over HTTP', async () => {
  const server = createServer({ exchangeCodeForOpenId: async () => 'op_test_user' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/wechat/debug-openid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'mock-code' })
  });
  const data = await response.json();
  server.close();
  assert.equal(response.status, 200);
  assert.deepEqual(data, { openid: 'op_test_user' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/zpeng/.config/superpowers/worktrees/miniprogram_wechat_order/cloudbase-order && npm test`
Expected: FAIL because the temporary endpoint behavior is not implemented yet

- [ ] **Step 3: Write minimal implementation**

In `backend/server.js`:

1. Add `POST /wechat/debug-openid`
2. Parse JSON payload
3. Read `code`
4. Return `400` with `{ error: 'code is required.' }` if missing
5. Reuse `exchangeCodeForOpenId(code)`
6. Return `200` with:

```json
{
  "openid": "opxxxxxxxxxxxxxxxx"
}
```

Do not write binding state. Do not change whitelist logic for existing admin routes. For testability, extract a tiny `validateDebugOpenIdPayload` helper and a tiny `lookupOpenIdForDebug(code, exchangeFn)` helper, use them from the route implementation, and export them from `backend/server.js` for direct test coverage. If the exchange path fails because WeChat credentials are missing, return `400` with `{ error: '缺少微信小程序 AppID 或 AppSecret。' }` instead of a generic 500.
Also update `createServer(...)` to accept an optional injected dependency object such as:

```js
createServer({ exchangeCodeForOpenId: customExchangeFn } = {})
```

so HTTP-level tests can stub the WeChat exchange path without hitting real credentials or the network.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/zpeng/.config/superpowers/worktrees/miniprogram_wechat_order/cloudbase-order && npm test`
Expected: PASS for the new endpoint test and all existing tests

- [ ] **Step 5: Commit**

```bash
git add backend/server.js backend/server.test.js
git commit -m "feat: add temporary openid lookup endpoint"
```

### Task 2: Expose request failure status codes to page logic

**Files:**
- Modify: `miniprogram/utils/request.js`
- Create: `miniprogram/utils/request.test.js`

- [ ] **Step 1: Write the failing test expectation**

Create `miniprogram/utils/request.test.js` with a mocked `wx.request` failure response and pin the rejected error shape:

```js
test('request rejects with message and statusCode for non-2xx responses', async () => {
  global.wx = {
    request(options) {
      options.success({ statusCode: 403, data: { error: '当前微信没有管理员权限。' } });
    }
  };

  await assert.rejects(
    request({ url: '/wechat/status' }),
    error => error.message === '当前微信没有管理员权限。' && error.statusCode === 403
  );
});
```

- [ ] **Step 2: Inspect current request rejection path**

Run: `cd /home/zpeng/.config/superpowers/worktrees/miniprogram_wechat_order/cloudbase-order && node --test miniprogram/utils/request.test.js`
Expected: FAIL because `request.js` does not yet attach `statusCode`

- [ ] **Step 3: Write minimal implementation**

Update `miniprogram/utils/request.js` so non-2xx responses still reject, but the rejected `Error` also includes:

```js
error.statusCode = res.statusCode;
```

Keep success handling and existing message extraction intact.

- [ ] **Step 4: Verify the request helper contract**

Run: `cd /home/zpeng/.config/superpowers/worktrees/miniprogram_wechat_order/cloudbase-order && node --test miniprogram/utils/request.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/request.js miniprogram/utils/request.test.js
git commit -m "feat: expose request status codes"
```

### Task 3: Add notify-page OpenID helper UX

**Files:**
- Create: `miniprogram/pages/notify/state.js`
- Create: `miniprogram/pages/notify/state.test.js`
- Modify: `miniprogram/pages/notify/index.js`
- Modify: `miniprogram/pages/notify/index.wxml`

- [ ] **Step 1: Write the failing test expectation**

Create pure-helper tests in `miniprogram/pages/notify/state.test.js`:

```js
test('buildNotifyViewState enters init mode for 403 errors', () => {
  assert.deepEqual(buildNotifyViewState({ statusCode: 403 }), {
    initMode: true,
    showAdminActions: false
  });
});

test('buildCopyResultMessage falls back to manual copy text when clipboard fails', () => {
  assert.match(buildCopyResultMessage('op_test_user', false), /手动复制/);
});
```

- [ ] **Step 2: Inspect current notify page implementation**

Run:

```bash
cd /home/zpeng/.config/superpowers/worktrees/miniprogram_wechat_order/cloudbase-order && node --test miniprogram/pages/notify/state.test.js
```

Expected: FAIL because the helper module and tests are not implemented yet

- [ ] **Step 3: Write minimal implementation**

In `miniprogram/pages/notify/state.js`:

1. Add a small helper like:

```js
function buildNotifyViewState(error) {
  return {
    initMode: Boolean(error && error.statusCode === 403),
    showAdminActions: !(error && error.statusCode === 403)
  };
}
```

2. Add a small helper for modal content / clipboard fallback text.

In `miniprogram/pages/notify/index.js`:

1. Add page state such as:

```js
initMode: false,
currentOpenId: ''
```

2. In `loadStatus()`:
   - if request fails with `statusCode === 403`, set `initMode: true`, clear normal status card data, and suppress treating this as a generic page failure
   - for other failures, keep existing error handling

3. Add a `fetchMyOpenId()` action:
   - call `getLoginCode()`
   - `POST /wechat/debug-openid` with `{ code }`
   - save returned `openid`
   - call clipboard API
   - show modal with the full OpenID
   - if clipboard fails, still show modal and mention manual copy
   - if `wx.login()` does not provide code, show `未获取到登录 code`
   - if the helper request fails, reuse the existing `getErrorMessage(...)` path for modal/error text

In `miniprogram/pages/notify/index.wxml`:

1. Add helper button text such as `获取我的 OpenID`
2. Add short init guidance text for the 403 init state
3. Hide bind/subscribe buttons when `initMode` is true
4. Keep the helper button visible even when page errors are non-403 generic failures

Do not change the existing bind-admin request payload or subscribe flow.

- [ ] **Step 4: Verify the behavior**

Run:

```bash
cd /home/zpeng/.config/superpowers/worktrees/miniprogram_wechat_order/cloudbase-order && node --test miniprogram/pages/notify/state.test.js miniprogram/utils/request.test.js && npm test
```

Expected: PASS for the new helper/unit tests and all existing tests

Then inspect the page files:

```bash
cd /home/zpeng/.config/superpowers/worktrees/miniprogram_wechat_order/cloudbase-order && sed -n '1,260p' miniprogram/pages/notify/index.js && printf '\n---\n' && sed -n '1,220p' miniprogram/pages/notify/index.wxml
```

Expected: helper button exists, 403 init state is explicit, and admin-only actions are hidden during initialization

Also verify the implementation contains:

- non-403 error path still renders the helper button
- helper success path shows the full OpenID in modal content
- clipboard failure path still shows the full OpenID and manual-copy guidance
- helper request failures reuse the existing error messaging path

Then run one execution-based verification in the mini program environment:

- Open the notify page in WeChat developer tools
- Simulate the 403 init state by keeping `WECHAT_ADMIN_OPENIDS` unconfigured
- Confirm the helper button is visible while admin-only actions are hidden
- In real-device debugging, tap `获取我的 OpenID`
- Expected: the page requests `POST /wechat/debug-openid`, shows the full OpenID, and copies it or shows manual-copy guidance

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/notify/index.js miniprogram/pages/notify/index.wxml miniprogram/pages/notify/state.js miniprogram/pages/notify/state.test.js miniprogram/utils/request.test.js
git commit -m "feat: add notify page openid helper"
```

### Task 4: Final verification

**Files:**
- Test: `backend/server.test.js`
- Test: `miniprogram/utils/request.js`
- Test: `miniprogram/pages/notify/state.js`

- [ ] **Step 1: Run automated tests**

Run: `cd /home/zpeng/.config/superpowers/worktrees/miniprogram_wechat_order/cloudbase-order && npm test`
Expected: all default tests pass

- [ ] **Step 2: Run focused helper tests**

Run:

```bash
cd /home/zpeng/.config/superpowers/worktrees/miniprogram_wechat_order/cloudbase-order && node --test miniprogram/utils/request.test.js miniprogram/pages/notify/state.test.js
```

Expected: all focused helper tests pass

- [ ] **Step 3: Run local smoke check**

Run:

```bash
cd /home/zpeng/.config/superpowers/worktrees/miniprogram_wechat_order/cloudbase-order && ALLOW_FILE_STORAGE=true node -e "const { startServer } = require('./backend/server'); startServer().then(server=>{ const port=server.address().port; return fetch('http://127.0.0.1:'+port+'/ping').then(r=>Promise.all([Promise.resolve(r.status),r.text()])).then(([status,text])=>{ console.log(status+':'+text); server.close();});}).catch(err=>{ console.error(err); process.exit(1);});"
```

Expected: `200:pong`

- [ ] **Step 4: Check git state**

Run: `cd /home/zpeng/.config/superpowers/worktrees/miniprogram_wechat_order/cloudbase-order && git status --short`
Expected: only intended changes remain

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: verify temporary openid helper flow"
```
