type TrainingCardProps = {
  title: string;
  eyebrow: string;
  description: string;
  detail?: string;
  highlights: string[];
  index: number;
};

export function TrainingCard({ title, eyebrow, description, detail, highlights, index }: TrainingCardProps) {
  return (
    <article className="panel p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase text-electric">{eyebrow}</p>
          <h3 className="mt-2 text-2xl font-black text-navy">{title}</h3>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-navy text-sm font-black text-white">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <p className="mt-4 leading-7 text-slate-600">{description}</p>
      {detail ? <p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p> : null}
      <ul className="mt-6 grid gap-3">
        {highlights.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-field" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
