import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignInput, pendingReminders } from "../src/course_dispatch.ts";

test("only learners with an unfinished course receive deadline reminders", () => {
  const campaign = campaignInput.parse({
    campaignId: "fall-checkout", course: "Storefront checkout", deadline: "2026-10-01T17:00:00.000Z",
    learners: [{ id: "pending", phone: "+15551234567", completed: false }, { id: "finished", phone: "+15557654321", completed: true }],
  });
  assert.deepEqual(pendingReminders(campaign).map(({ learnerId }) => learnerId), ["pending"]);
  assert.match(pendingReminders(campaign)[0]!.body, /2026-10-01T17:00:00.000Z/);
});
