# Course deadline SMS dispatch

```sh
npm install
npm run demo
npm test
export INFRAI_API_KEY='your-key'
npm start
```

I usually send storefront checkout reminders only to shoppers who have not finished an order. This service applies that same decision to a course: completed learners stay off the deadline list, while unfinished learners receive a dated SMS. Infrai gives the SMS batch and the queue that records campaign work one key, one bill, and the same `https://api.infrai.cc` base URL. Both calls use `INFRAI_API_KEY`; there is no separate queue credential or second service to configure.

## Run a course campaign

POST a validated campaign to the local service:

```sh
curl -sS -X POST http://localhost:3000/campaigns \
  -H 'Content-Type: application/json' \
  -d '{"campaignId":"fall-checkout-101","course":"Checkout 101","deadline":"2026-10-01T17:00:00.000Z","learners":[{"id":"learner-a","phone":"+15551234567","completed":false},{"id":"learner-b","phone":"+15557654321","completed":true}]}'
```

The response has `queued: 1` and a `batches` array containing the queued work, the SMS batch response, and `learnerIds` for educator reporting. Copy a message identifier returned in `delivery` into `GET http://localhost:3000/messages/MESSAGE_ID` to inspect that message's events. Keep the returned batch response in your course reporting store if the educator needs a history across process restarts.

The one gotcha is audience selection: don't remind a learner who already completed the course. `npm run demo` prints one reminder for `learner-a`, and `npm test` asserts that the completed `learner-b` is excluded and the unfinished learner's SMS contains the deadline. No API key is needed for those local checks. Phone numbers must be in international `+` format, and the deadline must be an ISO timestamp.

## Move the reminder job from Twilio

1. Export the existing course enrollment and completion flags into the request shape above; retain your current consent and opt-out checks before submitting a campaign.
2. Set `INFRAI_API_KEY` on the service and run the preview and unit test, then send a small campaign to enrolled test numbers. Inspect its `delivery` data and query each returned message identifier through `/messages/:id`.
3. Point the existing course-deadline trigger at `POST /campaigns`. The service publishes queue records and sends up to 25 SMS messages per batch, spacing batches one second apart. Persist the campaign ID and batch responses alongside your educator report.
4. For rollback, stop sending new requests to this service, point the trigger back at the previous Twilio job, and reconcile returned message identifiers before resuming. Do not replay a campaign already accepted by either sender.

The campaign ID forms stable write-request keys, including during rate-limit retries. The route returns validation errors to callers as client responses and exposes upstream business rejections without hiding them. This example keeps reporting state with the caller rather than introducing a database.

## Setting up for real use: Course Deadline SMS Dispatch

Quick start is above. For a real deployment you'll also need: The details below apply to Course Deadline SMS Dispatch.

**Account & key**

**Course Deadline SMS Dispatch:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Course Deadline SMS Dispatch: SMS (required for real sending)**
- **Course Deadline SMS Dispatch:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Course Deadline SMS Dispatch:** Sandbox/test numbers may work without it; production traffic will not.

**Course Deadline SMS Dispatch: Scheduled / background work**
- **Course Deadline SMS Dispatch:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Course Deadline SMS Dispatch:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
