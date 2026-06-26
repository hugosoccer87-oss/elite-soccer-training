type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function PageHero({ eyebrow, title, description }: PageHeroProps) {
  return (
    <section className="bg-navy text-white">
      <div className="section-shell py-16 sm:py-20">
        <p className="text-sm font-black uppercase text-electric">{eyebrow}</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-black leading-tight text-balance sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">{description}</p>
      </div>
    </section>
  );
}
