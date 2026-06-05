import type { Metadata } from "next";
import { ParentReviewsSection } from "@/components/ParentReviewsSection";
import { PageHero } from "@/components/PageHero";
import { ReviewForm } from "@/components/ReviewForm";

export const metadata: Metadata = {
  title: "Parent Reviews",
  description: "Read parent reviews and submit a testimonial for Elite Soccer Training CV."
};

export default function ReviewsPage() {
  return (
    <>
      <PageHero
        eyebrow="Parent Reviews"
        title="Families trust the training environment at Elite Soccer Training CV."
        description="Read approved parent reviews or submit your own testimonial for Coach Hugo to review."
      />

      <ParentReviewsSection background="white" showBookButton={false} />

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
          <div>
            <p className="text-sm font-black uppercase text-electric">Share Feedback</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-navy">Leave a parent review.</h2>
            <p className="mt-4 leading-7 text-slate-600">
              Your review helps other families understand the standard, energy, and development focus of EST CV
              training. Reviews are reviewed before they appear publicly.
            </p>
          </div>
          <ReviewForm />
        </div>
      </section>
    </>
  );
}
