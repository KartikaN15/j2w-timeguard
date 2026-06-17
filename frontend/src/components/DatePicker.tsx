import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromYmd(s?: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

// Date picker with a consistent "DD MMM YYYY" display (locale-independent),
// storing/emitting the value as a YYYY-MM-DD string.
export function DatePicker({
  value,
  onChange,
  min,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromYmd(value);
  const minDate = fromYmd(min);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`h-10 w-full justify-start gap-2 font-normal ${className ?? ""}`}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          {selected ? format(selected, "dd MMM yyyy") : <span className="text-muted-foreground">Select date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) {
              onChange(toYmd(d));
              setOpen(false);
            }
          }}
          disabled={minDate ? { before: minDate } : undefined}
          defaultMonth={selected}
        />
      </PopoverContent>
    </Popover>
  );
}
