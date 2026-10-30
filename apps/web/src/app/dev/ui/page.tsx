import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar } from "../../../ui/Avatar";
import { Badge } from "../../../ui/Badge";
import { BottomNav } from "../../../ui/BottomNav";
import { Button, LinkButton } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Container, Section } from "../../../ui/Container";
import { ErrorSummary } from "../../../ui/ErrorSummary";
import { FormSection, FormSteps } from "../../../ui/FormSection";
import { FreshnessPips } from "../../../ui/FreshnessPips";
import { EmptyState, ErrorState, InlineStatus } from "../../../ui/feedback";
import {
  Checkbox,
  FieldError,
  FieldHint,
  Radio,
  Select,
  TextArea,
  TextField,
} from "../../../ui/form";
import { CheckboxGroup, ChipGroup, RadioGroup } from "../../../ui/groups";
import { Heading } from "../../../ui/Heading";
import { ICON_NAMES, Icon } from "../../../ui/Icon";
import { InfoToggle } from "../../../ui/InfoToggle";
import { MetaLine } from "../../../ui/MetaLine";
import { Pagination } from "../../../ui/Pagination";
import { Panel } from "../../../ui/Panel";
import { Photo } from "../../../ui/Photo";
import { PhotoSlider } from "../../../ui/PhotoSlider";
import { PrevNext } from "../../../ui/PrevNext";
import { Skeleton } from "../../../ui/Skeleton";
import { Spinner } from "../../../ui/Spinner";
import { StickyActionBar } from "../../../ui/StickyActionBar";
import { Tabs } from "../../../ui/Tabs";
import { Text } from "../../../ui/Text";
import { TextLink } from "../../../ui/TextLink";
import { Toast } from "../../../ui/Toast";
import { Toggle } from "../../../ui/Toggle";
import {
  ChoiceChipDemo,
  ComboboxDemo,
  ComboboxMultiDemo,
  FilterTabsDemo,
  MenuDemo,
  MenuIconDemo,
  ModalDemo,
  ModalHeaderDemo,
  MultiSelectRowsDemo,
  PopoverDemo,
  SheetDemo,
  ToastDemo,
  ToggleChipDemo,
} from "./Demos";
import { SegmentedDemo } from "./SegmentedDemo";

/**
 * The kit's showcase: every component in every variant and state, at the real tokens. Dev only: a
 * 404 in a production build unless OPIKA_DEV_UI=1 (the harness sets it). Not indexed, not in the
 * sitemap. Add a section here whenever a component is added to `src/ui` (guard 7 checks).
 */
export const metadata: Metadata = {
  title: "Kit",
  robots: { index: false, follow: false },
};

// Read per request, so a production build without the flag answers 404 at run time, not at build time.
export const dynamic = "force-dynamic";

function devUiEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.OPIKA_DEV_UI === "1";
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Section labelledBy={id}>
      <Heading level={2} id={id}>
        {title}
      </Heading>
      <div className="flex flex-col gap-6">{children}</div>
    </Section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Text look="hint">{label}</Text>
      <div className="flex min-w-0 flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

const SIZES = "(max-width: 599px) 100vw, 328px";

export default function DevUiPage() {
  if (!devUiEnabled()) notFound();
  return (
    <Container as="main" className="pb-16">
      <Heading level={1} look="display-l" className="py-6">
        UI kit
      </Heading>

      <Group id="g-type" title="Type scale">
        <Heading level={1} look="display-xl">
          Display XL
        </Heading>
        <Heading level={2} look="display-l">
          Display L
        </Heading>
        <Heading level={2}>Title 26 / 700</Heading>
        <Heading level={2} look="section">
          Section: 20 on a phone, 26 from tablet
        </Heading>
        <Heading level={3}>Body L heading 20 / 700</Heading>
        <Text look="lead">Lead 20</Text>
        <Text>Body 16, the default for reading.</Text>
        <Text look="label">Label 16 / 600</Text>
        <Text look="hint">Hint 14 / ink-2, the smallest text anywhere.</Text>
      </Group>

      <Group id="g-actions" title="Actions">
        <Row label="Button md: primary, accent, secondary, ghost">
          <Button>Primary</Button>
          <Button variant="accent">Accent</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
        </Row>
        <Row label="Button lg">
          <Button size="lg">Primary lg</Button>
          <Button size="lg" variant="accent">
            Accent lg
          </Button>
        </Row>
        <Row label="Icon buttons (md, lg)">
          <Button variant="icon" aria-label="Menu">
            <Icon name="menu" />
          </Button>
          <Button variant="icon" size="lg" aria-label="Close">
            <Icon name="close" />
          </Button>
        </Row>
        <Row label="States: disabled, loading">
          <Button disabled>Disabled</Button>
          <Button status="loading">Loading</Button>
        </Row>
        <Row label="LinkButton, TextLink">
          <LinkButton href="/dev/ui">Link button</LinkButton>
          <LinkButton href="/dev/ui" variant="secondary">
            Secondary link
          </LinkButton>
          <Text as="span">
            Inline <TextLink href="/dev/ui">text link</TextLink> in a sentence.
          </Text>
        </Row>
      </Group>

      <Group id="g-chips" title="Chips and badges">
        <Row label="option (checkbox, radio; works without JS)">
          <Chip kind="option" type="checkbox" name="o1" value="a" defaultChecked>
            Checked
          </Chip>
          <Chip kind="option" type="checkbox" name="o2" value="b">
            Unchecked
          </Chip>
          <Chip kind="option" type="radio" name="o3" value="c">
            Radio
          </Chip>
        </Row>
        <Row label="choice (44px, 48px hit area; count; disabled stays focusable as a button)">
          <ChoiceChipDemo />
          <Chip kind="choice" control="checkbox" name="c1" value="a" count={9} defaultChecked>
            Checkbox
          </Chip>
          <Chip kind="choice" control="checkbox" name="c2" value="b" count={0} disabled>
            Disabled
          </Chip>
        </Row>
        <Row label="toggle (aria-pressed)">
          <ToggleChipDemo />
          <Chip kind="toggle" pressed>
            Pressed
          </Chip>
        </Row>
        <Row label="link (current)">
          <Chip kind="link" href="/dev/ui" current>
            Current
          </Chip>
          <Chip kind="link" href="/dev/ui">
            Other
          </Chip>
        </Row>
        <Row label="info">
          <Chip kind="info">Neutral</Chip>
          <Chip kind="info" tone="outline">
            Outline
          </Chip>
        </Row>
        <Row label="status">
          <Chip kind="status" tone="ink">
            Ink
          </Chip>
          <Chip kind="status" tone="accent">
            Accent
          </Chip>
          <Chip kind="status" tone="success">
            Success
          </Chip>
          <Chip kind="status" tone="warning">
            Warning
          </Chip>
          <Chip kind="status" tone="danger">
            Danger
          </Chip>
          <Chip kind="status" tone="published">
            Published
          </Chip>
          <Chip kind="status" tone="reserved">
            Reserved
          </Chip>
          <Chip kind="status" tone="adopted">
            Adopted
          </Chip>
          <Chip kind="status" tone="withdrawn">
            Withdrawn
          </Chip>
        </Row>
        <Row label="Badge">
          <Badge tone="dog">Dog</Badge>
          <Badge tone="cat">Cat</Badge>
          <Badge tone="ink">Reserved</Badge>
          <Badge tone="neutral">Neutral</Badge>
        </Row>
        <Row label="MetaLine">
          <MetaLine parts={["Boy", "adult", "medium"]} />
        </Row>
      </Group>

      <Group id="g-containers" title="Containers and media">
        <Row label="Card tones">
          <Card tone="surface" className="p-4">
            <Text>Surface card</Text>
          </Card>
          <Card tone="outline" className="p-4">
            <Text>Outline card</Text>
          </Card>
        </Row>
        <Row label="Panel tones">
          <Panel tone="surface">
            <Text>Surface</Text>
          </Panel>
          <Panel tone="sunken">
            <Text>Sunken</Text>
          </Panel>
          <Panel tone="outline" padding="lg">
            <Text>Outline, large padding</Text>
          </Panel>
        </Row>
        <Row label="Photo (card, square, wide, portrait), and with no photo">
          <Photo
            src="seed-photos/cat-1.jpg"
            alt=""
            sizes={SIZES}
            aspect="card"
            className="w-40 rounded-card"
          />
          <Photo
            src="seed-photos/cat-2.jpg"
            alt=""
            sizes={SIZES}
            aspect="square"
            className="w-32 rounded-panel"
          />
          <Photo
            src="seed-photos/cat-3.jpg"
            alt=""
            sizes={SIZES}
            aspect="wide"
            className="w-48 rounded-panel"
          />
          <Photo src={null} alt="" sizes={SIZES} aspect="portrait" className="w-32 rounded-panel" />
        </Row>
        <Row label="PhotoSlider (scroll-snap, prev/next when it overflows)">
          <PhotoSlider
            photos={[
              { src: "seed-photos/cat-1.jpg", alt: "" },
              { src: "seed-photos/cat-2.jpg", alt: "" },
              { src: "seed-photos/cat-3.jpg", alt: "" },
            ]}
            sizes="(max-width: 599px) 80vw, 360px"
            label="Photos"
            prevLabel="Previous photo"
            nextLabel="Next photo"
            className="w-full"
          />
        </Row>
        <Row label="PhotoSlider (tall 3:4, one full slide: the pet card)">
          <PhotoSlider
            photos={[
              { src: "seed-photos/cat-1.jpg", alt: "" },
              { src: "seed-photos/cat-2.jpg", alt: "" },
            ]}
            sizes="(max-width: 392px) calc(100vw - 32px), 360px"
            label="Photos"
            prevLabel="Previous photo"
            nextLabel="Next photo"
            aspect="tall"
            slide="full"
            className="w-full"
          />
        </Row>
        <Row label="Avatar: logo, initials (sm, md, lg, xl)">
          <Avatar kind="logo" src="seed-photos/cat-4.jpg" />
          <Avatar kind="initials" name="Домівка друзів" size="sm" />
          <Avatar kind="initials" name="Домівка друзів" />
          <Avatar kind="initials" name="Домівка друзів" size="lg" />
          <Avatar kind="initials" name="Домівка друзів" size="xl" />
        </Row>
      </Group>

      <Group id="g-forms" title="Form controls">
        <TextField id="f-text" label="Text field" hint="A hint in ink-2." />
        <TextField id="f-err" label="With error" error="This field is required." />
        <TextArea id="f-area" label="Text area" />
        <Select id="f-select" label="Select">
          <option>One</option>
          <option>Two</option>
        </Select>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label text-ink">Radio and checkbox</legend>
          <Radio name="r" label="Radio option" defaultChecked />
          <Checkbox name="c" label="Checkbox option" />
        </fieldset>
        <SegmentedDemo />
        <RadioGroup
          name="rg"
          legend="Radio group"
          defaultValue="b"
          hint="A fieldset with a legend; submits with a plain form."
          options={[
            { value: "a", label: "Option A" },
            { value: "b", label: "Option B" },
          ]}
        />
        <CheckboxGroup
          name="cg"
          legend="Checkbox group"
          defaultValue={["a"]}
          error="Pick at least two."
          options={[
            { value: "a", label: "Option A" },
            { value: "b", label: "Option B" },
          ]}
        />
        <ChipGroup name="chg" legend="Chip group" hint="Many short options as wrapping chips.">
          <Chip kind="option" type="checkbox" name="chg" value="a" defaultChecked>
            Option A
          </Chip>
          <Chip kind="option" type="checkbox" name="chg" value="b">
            Option B
          </Chip>
          <Chip kind="option" type="checkbox" name="chg" value="c">
            Option C
          </Chip>
        </ChipGroup>
        <ErrorSummary
          ref={null}
          items={[
            { key: "a", message: "Enter a name.", target: "#chg-first" },
            { key: "b", message: "Pick a kind.", target: "#chg-first" },
          ]}
        />
        <FieldHint id="h1">FieldHint on its own.</FieldHint>
        <FieldError id="e1">FieldError on its own.</FieldError>
      </Group>

      <Group id="g-navigation" title="Navigation">
        <Row label="Pagination (page 5 of 83, and page 1 of 3)">
          <Pagination
            page={5}
            totalPages={83}
            hrefFor={(n) => `/dev/ui?page=${n}`}
            navLabel="Pages"
            prevLabel="Previous page"
            nextLabel="Next page"
            pageLabel="Page {page}"
            currentLabel="current"
            ofTotalLabel="of 83"
          />
          <Pagination
            page={1}
            totalPages={3}
            hrefFor={(n) => `/dev/ui?page=${n}`}
            navLabel="Few pages"
            prevLabel="Previous page"
            nextLabel="Next page"
            pageLabel="Page {page}"
            currentLabel="current"
          />
        </Row>
        <Row label="Toggle (two links)">
          <Toggle
            label="Sort"
            current={0}
            options={[
              {
                label: "Newest",
                href: "/dev/ui?sort=new",
                ariaLabel: "Newest. Freshest cards first",
              },
              {
                label: "Waiting",
                href: "/dev/ui?sort=wait",
                ariaLabel: "Waiting. Longest wait first",
              },
            ]}
          />
        </Row>
        <Row label="PrevNext">
          <PrevNext
            prev={{ href: "/dev/ui?a=1", label: "Previous animal" }}
            next={{ href: "/dev/ui?a=3", label: "Next animal" }}
          />
        </Row>
        <Row label="Tabs">
          <Tabs
            label="Sections"
            className="w-full"
            tabs={[
              { id: "one", label: "One", panel: <Text>First panel</Text> },
              { id: "two", label: "Two", panel: <Text>Second panel</Text> },
              { id: "three", label: "Three", panel: <Text>Third panel</Text> },
            ]}
          />
        </Row>
        <Row label="BottomNav (a fixed bar; contained here)">
          <div className="relative h-20 w-full transform-gpu overflow-hidden rounded-panel border-2 border-line">
            <BottomNav
              label="Cabinet"
              current="animals"
              items={[
                { key: "home", href: "/dev/ui?n=home", label: "Home" },
                { key: "animals", href: "/dev/ui?n=animals", label: "Animals" },
                { key: "profile", href: "/dev/ui?n=profile", label: "Shelter" },
              ]}
            />
          </div>
        </Row>
      </Group>

      <Group id="g-form-layout" title="Long forms">
        <Row label="FormSteps (anchors to the sections below)">
          <FormSteps
            labelledBy="g-form-layout"
            steps={[
              { id: "demo-basics", label: "Basics" },
              { id: "demo-photos", label: "Photos" },
              { id: "demo-about", label: "About" },
            ]}
          />
        </Row>
        <FormSection
          id="demo-basics"
          title="Basics"
          step={1}
          description="One quiet line under the title."
        >
          <TextField id="demo-name" label="Name" />
        </FormSection>
        <FormSection id="demo-photos" title="Photos" step={2}>
          <Text look="hint">A section without fields.</Text>
        </FormSection>
        <FormSection id="demo-about" title="About">
          <Text look="hint">An unnumbered section.</Text>
        </FormSection>
        <Row label="StickyActionBar (sticks to the screen's bottom edge on a real form; in the flow here)">
          <div className="w-full">
            <StickyActionBar>
              <Text look="hint">Draft saved at 12:00</Text>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1">
                  Save
                </Button>
                <Button className="flex-1">Publish</Button>
              </div>
            </StickyActionBar>
          </div>
        </Row>
        <Row label="FreshnessPips (fresh, aging, stale)">
          <FreshnessPips kind="fresh" label="Updated today" />
          <FreshnessPips kind="aging" label="Updated 12 days ago" />
          <FreshnessPips kind="stale" label="Updated 45 days ago" />
        </Row>
      </Group>

      <Group id="g-overlays" title="Overlays">
        <Row label="Modal, Sheet (hash-openable), Popover">
          <ModalDemo />
          <ModalHeaderDemo />
          <SheetDemo />
        </Row>
        <PopoverDemo />
        <Row label="Combobox (mock async source; a dialog below 600px)">
          <ComboboxDemo />
        </Row>
        <Row label="Combobox, multi-select mode (local options, count badge, ✕, top-layer list)">
          <ComboboxMultiDemo />
        </Row>
        <Row label="Multi-select rows: listbox (combobox) and checklist (phone sheet)">
          <MultiSelectRowsDemo />
        </Row>
        <Row label="Menu (a row's «More»)">
          <MenuDemo />
        </Row>
        <Row label="Menu (⋯ trigger, divider, danger item)">
          <MenuIconDemo />
        </Row>
        <Row label="FilterTabs">
          <FilterTabsDemo />
        </Row>
        <Row label="InfoToggle">
          <InfoToggle label="How the list is ordered">
            By date: the freshest cards first.
          </InfoToggle>
        </Row>
      </Group>

      <Group id="g-feedback" title="Feedback">
        <Row label="Skeleton shapes">
          <Skeleton shape="line" className="w-48" />
          <Skeleton shape="circle" />
          <Skeleton shape="block" className="h-20 w-48" />
        </Row>
        <Row label="Spinner">
          <Spinner label="Loading" />
        </Row>
        <InlineStatus tone="info">Info status</InlineStatus>
        <InlineStatus tone="success">Success status</InlineStatus>
        <InlineStatus tone="warning">Warning status</InlineStatus>
        <InlineStatus tone="error">Error status</InlineStatus>
        <EmptyState
          title="Nothing here yet"
          body="Empty state with an action."
          action={<LinkButton href="/dev/ui">Go back</LinkButton>}
        />
        <ErrorState title="Something went wrong" body="Error state, announced to screen readers." />
        <Row label="Toast (info, success, error) and a live demo">
          <Toast tone="info" message="Info toast" dismissLabel="Dismiss" />
          <Toast tone="success" message="Saved" dismissLabel="Dismiss" />
          <Toast tone="error" message="Could not save" dismissLabel="Dismiss" />
          <ToastDemo />
        </Row>
      </Group>

      <Group id="g-icons" title="Icons">
        <div className="flex flex-wrap gap-4">
          {ICON_NAMES.map((name) => (
            <div key={name} className="flex w-20 flex-col items-center gap-1 text-ink">
              <Icon name={name} />
              <Text look="hint" as="span">
                {name}
              </Text>
            </div>
          ))}
        </div>
      </Group>
    </Container>
  );
}
