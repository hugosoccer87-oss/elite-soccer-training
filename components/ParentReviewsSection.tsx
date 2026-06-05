import Link from "next/link";
import { StarIcon } from "@/components/Icons";
import { SectionHeader } from "@/components/SectionHeader";
import { approvedReviews } from "@/lib/reviews-data";

type ParentReviewsSectionProps = {
  background?: "mist" | "white";
  showBookButton?: boolean;
};

export function ParentReviewsSection({ background = "mist", showBookButton = true }: ParentReviewsSectionProps) {
  const backgroundClass = background === "white" ? "bg-white" : "bg-mist";

  return (
    <section className={`${backgroundClass} py-16 sm:py-20`}>
      <div className="section-shell">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeader
            eyebrow="Parent Reviews"
            title="What Parents Are Saying"
            description="Hear from families who trust Elite Soccer Training CV."
          />
          <Link
            href="/reviews#review-form"
            className="inline-flex w-full justify-center rounded-md border border-navy px-6 py-3 text-sm font-black uppercase text-navy transition hover:border-electric hover:text-electric sm:w-fit"
          >
            Leave a Review
          </Link>
        </div>

        {approvedReviews.length > 0 ? (
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {approvedReviews.map((testimonial) => (
              <article key={testimonial.id} className="panel p-6">
                <div className="flex gap-1 text-electric" aria-label={`${testimonial.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <StarIcon
                      key={`${testimonial.id}-${index}`}
                      className={`h-4 w-4 ${index < testimonial.rating ? "text-electric" : "text-slate-300"}`}
                    />
                  ))}
                </div>
                <p className="mt-5 text-base font-semibold leading-7 text-slate-700">"{testimonial.review}"</p>
                <div className="mt-6 border-t border-slate-200 pt-4">
                  <p className="text-sm font-black uppercase text-navy">{testimonial.parentName}</p>
                  {testimonial.playerName || testimonial.playerAgeGroup ? (
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {[testimonial.playerName, testimonial.playerAgeGroup].filter(Boolean).join(" - ")}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-lg border border-slate-200 bg-white p-6">
            <p className="text-sm font-bold leading-6 text-slate-600">
              Approved parent reviews will appear here after Coach Hugo reviews submitted testimonials.
            </p>
          </div>
        )}

        {showBookButton ? (
          <Link
            href="/booking"
            className="mt-8 inline-flex w-full justify-center rounded-md bg-electric px-7 py-4 text-sm font-black uppercase text-white shadow-xl shadow-electric/25 transition hover:bg-blue-500 sm:w-fit"
          >
            Book Training
          </Link>
        ) : null}
      </div>
    </section>
  );
}
