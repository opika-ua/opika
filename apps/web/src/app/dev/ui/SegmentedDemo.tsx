"use client";

import { useState } from "react";
import { SegmentedControl } from "../../../ui/form";

export function SegmentedDemo() {
  const [size, setSize] = useState<"s" | "m" | "l">("m");
  const [sex, setSex] = useState<"f" | "m">("f");
  const [long, setLong] = useState<"a" | "b" | "c">("a");
  return (
    <div className="flex flex-col gap-6" data-testid="segmented-demo">
      <SegmentedControl
        name="size"
        legend="Three segments, with hints"
        segments={[
          { value: "s", label: "Small", hint: "under 10 kg" },
          { value: "m", label: "Medium", hint: "10 to 25 kg" },
          { value: "l", label: "Large", hint: "25 kg and up" },
        ]}
        value={size}
        onChange={setSize}
        hint="Native radios; arrow keys move the choice. Hover and Tab to see the states."
      />
      <SegmentedControl
        name="sex"
        legend="Two segments"
        segments={[
          { value: "f", label: "Female" },
          { value: "m", label: "Male" },
        ]}
        value={sex}
        onChange={setSex}
      />
      <SegmentedControl
        name="long"
        legend="Long labels (wrap onto a second line when they do not fit)"
        segments={[
          { value: "a", label: "Ready to go home at once" },
          { value: "b", label: "Needs a quiet family first" },
          { value: "c", label: "Only with other dogs" },
        ]}
        value={long}
        onChange={setLong}
      />
    </div>
  );
}
