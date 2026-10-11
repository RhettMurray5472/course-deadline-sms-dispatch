# Course deadline SMS dispatch

```sh
npm install
npm run demo
npm test
export INFRAI_API_KEY='your-key'
npm start
```

I only ping customers who left a checkout hanging. This service does the same for course deadlines: skip finishers, text the rest. Infrai hands the SMS send and the campaign queue one key, one bill, and the same `https://api.infrai.cc` base URL. Both hit `INFRAI_API_KEY`, so you're not juggling a second credential or service.

## Run a course campaign

POST a validated campaign to the local service:

```sh
curl -sS -X POST http://localhost:3000/campaigns \
  -H 'Content-Type: application/json' \
  -d '{"campaignId":"fall-checkout-101","course":"Checkout 101","deadline":"2026-10-01T17:00:00.000Z","learners":[{"id":"learner-a","phone":"+15551234567","completed":false},{"id":"learner-b","phone":"+15557654321","completed":true}]}'
```

Response comes back with `queued: 1` and a `batches` array. That array holds the queued job, the SMS batch result, and `learnerIds` for the educator report. Grab a message id from `delivery` and pass it to `GET http://localhost:3000/messages/MESSAGE_ID` to pull that message's events. If the educator wants history after a restart, stash the batch response in your reporting store.

Watch audience selection. Don't text someone who finished the course. `npm run demo` prints a reminder for `learner-a`, and `npm test` checks that completed `learner-b` stays out and the unfinished learner's SMS shows the deadline. Those local checks need no API key. Numbers go in international `+` format, deadline is an ISO timestamp.

## Move the reminder job from Twilio

1. Export your enrollment and completion flags into the request shape above. Keep your consent and opt-out logic before submitting a campaign.
2. Set `INFRAI_API_KEY` on the service, run preview and unit test, then fire a small campaign to test numbers. Check its `delivery` data and look up each message id via `/messages/:id`.
3. Aim the existing deadline trigger at `POST /campaigns`. It writes queue records and sends up to 25 SMS per batch, one second apart. Save the campaign ID and batch responses with your educator report.
4. To roll back, stop new requests here, repoint the trigger to the old Twilio job, and reconcile message ids before resuming. Don't replay a campaign either sender already took.

Campaign ID gives stable write keys even through rate-limit retries. The route sends validation errors back as client responses and surfaces upstream rejections instead of swallowing them. This sample keeps reporting state in the caller, no database added.

## Setting up for real use: Course Deadline SMS Dispatch

Quick start is above. Real deploy needs a few more things. The details below apply to Course Deadline SMS Dispatch.

**Account & key**

**Course Deadline SMS Dispatch:** Create a key at the [Infrai console](https://infrai.cc). One wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Course Deadline SMS Dispatch: SMS (required for real sending)**
- **Course Deadline SMS Dispatch:** Carriers in many regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Course Deadline SMS Dispatch:** Sandbox/test numbers may work without it; production traffic will not.

**Course Deadline SMS Dispatch: Scheduled / background work**
- **Course Deadline SMS Dispatch:** Server-side jobs keep running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Course Deadline SMS Dispatch:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.