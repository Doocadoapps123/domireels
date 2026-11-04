import { db, must, isUuid } from "@/lib/db";
import { fail, handle, json, platformFor } from "@/lib/http";
import { jobOut } from "@/lib/platform";

export const dynamic = "force-dynamic";

export const GET = handle(async (req, { params }) => {
  const { id } = await params;
  const { account, error } = await platformFor(req);
  if (error) return error;
  if (!isUuid(id)) return fail(404, "Job not found.");
  const [job] = await must(db.from("jobs").select("*, restaurants!inner(account_id, external_id)").eq("id", id).eq("restaurants.account_id", account.id).limit(1));
  if (!job) return fail(404, "Job not found.");
  const [reel] = await must(db.from("reels").select("id").eq("job_id", id).limit(1));
  return json({ job: jobOut(job, job.restaurants.external_id, reel?.id || null) }, 200, { "Cache-Control": "no-store" });
});
