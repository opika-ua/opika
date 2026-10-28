"use client";

import { useState } from "react";
import { SegmentedControl } from "../../../ui/form";

export function SegmentedDemo() {
  const [value, setValue] = useState<"s" | "m" | "l">("m");
  return (
    <SegmentedControl
      name="size"
      legend="Segmented control"
      segments={[
        { value: "s", label: "Small", hint: "under 10 kg" },
        { value: "m", label: "Medium", hint: "10 to 25 kg" },
        { value: "l", label: "Large", hint: "25 kg and up" },
      ]}
      value={value}
      onChange={setValue}
      hint="Native radios; arrow keys move the choice."
    />
  );
}
