import { Download } from "lucide-react";
import { ButtonLink } from "@/components/button-link";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium tabular-nums">{n}</span>
      <span>{children}</span>
    </li>
  );
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-muted px-1 py-0.5 text-[0.8em]">{children}</code>
);

export function Guides() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section id="get" className="scroll-mt-20 space-y-4 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Get the Tinycast Store extension</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            It lists everything on this page inside Tinycast and installs it for you. It also makes the Install buttons here work.
          </p>
        </div>
        <ol className="space-y-3 text-sm">
          <Step n={1}>
            Download and unzip <Code>tinycast-store.zip</Code>.
          </Step>
          <Step n={2}>
            In Tinycast, open <strong>Settings › Extensions</strong> and turn extensions on.
          </Step>
          <Step n={3}>
            Choose <strong>Add Folder</strong> and select the unzipped <Code>tinycast-store</Code> folder.
          </Step>
          <Step n={4}>
            Open the palette and run <strong>Browse Tinycast Store</strong>.
          </Step>
        </ol>
        <ButtonLink variant="outline" href="/tinycast-store.zip" download>
          <Download /> Download tinycast-store.zip
        </ButtonLink>
      </section>

      <section id="publish" className="scroll-mt-20 space-y-4 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Publish yours</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            There is no submission form. Tag a public GitHub repository and it is listed on the next refresh, about once an hour.
          </p>
        </div>
        <ol className="space-y-3 text-sm">
          <Step n={1}>
            Build a Raycast-format extension: a <Code>package.json</Code> with <Code>commands</Code>, plus <Code>assets/</Code>.
          </Step>
          <Step n={2}>
            Add the topic <Code>tinycast-extension</Code> to the repo. Collections of extensions use <Code>tinycast-package</Code>.
          </Step>
          <Step n={3}>
            Ship built files so people need no toolchain: attach a <Code>.zip</Code> to a GitHub release, or commit the built{" "}
            <Code>&lt;command&gt;.js</Code> files.
          </Step>
        </ol>
        <ButtonLink
          variant="outline"
          href="https://github.com/mejiasd3v/tinycast-store/blob/main/docs/publishing.md"
          target="_blank"
          rel="noreferrer"
        >
          Publishing guide
        </ButtonLink>
      </section>
    </div>
  );
}
