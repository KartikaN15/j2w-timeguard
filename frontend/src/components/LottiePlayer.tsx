import { useEffect, useState } from "react";
import Lottie from "lottie-react";

type Props = {
  /** Name of the json file in /public/lottie/json (without extension) */
  name: string;
  className?: string;
  loop?: boolean;
};

// Loads a Lottie animation JSON from /public/lottie/json and plays it.
// Usage: <LottiePlayer name="team-working-on-project" className="h-48" />
export function LottiePlayer({ name, className, loop = true }: Props) {
  const [data, setData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/lottie/json/${encodeURIComponent(name)}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (!cancelled) setData(json); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [name]);

  if (!data) return <div className={className} aria-hidden />;
  return <Lottie animationData={data} loop={loop} className={className} />;
}
