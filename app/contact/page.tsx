import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { MailIcon, PhoneIcon, PinIcon, SocialIcon } from "@/components/Icons";
import { PageHero } from "@/components/PageHero";
import { SpecialRequestForm } from "@/components/SpecialRequestForm";
import { business } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Elite Soccer Training CV in the Coachella Valley."
};

export default function ContactPage() {
  const contactMethods = [
    { label: "Email", value: business.email, href: `mailto:${business.email}`, Icon: MailIcon },
    { label: "Phone", value: business.phone, href: business.phoneHref, Icon: PhoneIcon },
    { label: "Location", value: business.location, href: null, Icon: PinIcon }
  ];

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Ask about training availability in the Coachella Valley."
        description="Use the contact form for general questions, or submit a booking request if you already know the training type you want."
      />

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <aside className="grid gap-4">
            {contactMethods.map(({ label, value, href, Icon }) => {
              const content = (
                <div className="panel flex gap-4 p-5 transition hover:border-electric">
                  <Icon className="h-6 w-6 shrink-0 text-electric" />
                  <div>
                    <p className="text-sm font-black uppercase text-navy">{label}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{value}</p>
                  </div>
                </div>
              );

              return href ? (
                <a key={label} href={href}>
                  {content}
                </a>
              ) : (
                <div key={label}>{content}</div>
              );
            })}
            <a href={business.instagramUrl}>
              <div className="panel flex gap-4 p-5 transition hover:border-electric">
                <SocialIcon label="Instagram" className="h-6 w-6 shrink-0 text-electric" />
                <div>
                  <p className="text-sm font-black uppercase text-navy">Instagram</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{business.instagramHandle}</p>
                </div>
              </div>
            </a>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-black uppercase text-navy">Map</p>
              <div className="mt-4 flex aspect-[4/3] items-center justify-center rounded-md bg-[linear-gradient(135deg,#eef4fb,#d9eadf)] p-6 text-center text-sm font-bold leading-6 text-slate-600">
                Google Maps embed placeholder for Desert Christian Academy, 40700 Yucca Lane, Bermuda Dunes, CA 92203
              </div>
            </div>
          </aside>
          <ContactForm />
        </div>
      </section>

      <section id="special-request" className="bg-white py-16 sm:py-20">
        <div className="section-shell grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-sm font-black uppercase text-electric">Special Training Request</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-navy">
              Special Training Request
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Need a different time, private training option, sibling group, team session, or custom training need?
              Submit a special request and Coach Hugo will review the details.
            </p>
            <a
              href="#special-request-form"
              className="mt-6 inline-flex rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500"
            >
              Submit Special Request
            </a>
          </div>
          <SpecialRequestForm />
        </div>
      </section>
    </>
  );
}
