import { campaignInput, pendingReminders } from "../src/course_dispatch.ts";

const campaign = campaignInput.parse({
  campaignId: "autumn-checkout-101", course: "Checkout 101", deadline: "2026-10-01T17:00:00.000Z",
  learners: [{ id: "learner-a", phone: "+15551234567", completed: false }, { id: "learner-b", phone: "+15557654321", completed: true }],
});
console.log(JSON.stringify(pendingReminders(campaign), null, 2));
