import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar } from "../../../ui/Avatar";
import { Badge } from "../../../ui/Badge";
import { Button, LinkButton } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Container, Section } from "../../../ui/Container";
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
import { Heading } from "../../../ui/Heading";
import { ICON_NAMES, Icon } from "../../../ui/Icon";
import { MetaLine } from "../../../ui/MetaLine";
import { Panel } from "../../../ui/Panel";
import { Photo } from "../../../ui/Photo";
import { Skeleton } from "../../../ui/Skeleton";
import { Spinner } from "../../../ui/Spinner";
import { Text } from "../../../ui/Text";
import { TextLink } from "../../../ui/TextLink";
import { ModalDemo, PopoverDemo, SheetDemo, ToggleChipDemo } from "./Demos";
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
        <Row label="Avatar: logo, initials (sm, md, lg)">
          <Avatar kind="logo" src="seed-photos/cat-4.jpg" />
          <Avatar kind="initials" name="Домівка друзів" size="sm" />
          <Avatar kind="initials" name="Домівка друзів" />
          <Avatar kind="initials" name="Домівка друзів" size="lg" />
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
        <FieldHint id="h1">FieldHint on its own.</FieldHint>
        <FieldError id="e1">FieldError on its own.</FieldError>
      </Group>

      <Group id="g-overlays" title="Overlays">
        <Row label="Modal, Sheet (hash-openable), Popover">
          <ModalDemo />
          <SheetDemo />
        </Row>
        <PopoverDemo />
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
