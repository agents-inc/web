import { DOMAIN_LABELS, STACKS } from "@workspace/matrix"
import { Button } from "@workspace/ui/components/button"
import { CommandBlock } from "@workspace/ui/components/command-block"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogFooterNote,
  DialogHeader,
  DialogPane,
  DialogPaneHeading,
  DialogPanes,
  DialogRule,
} from "@workspace/ui/components/dialog"

import {
  selectInstallInventory,
  summarize,
  type InventorySkill,
} from "@/features/configure/lib/derive"
import type { AddedSkill } from "@/stores/added-skills-store"
import type { ConfigSelection } from "@/features/configure/lib/derive"
import { useUiStore } from "@/stores/ui-store"

function ScopeGroup({
  label,
  skills,
  first = false,
}: {
  label: string
  skills: InventorySkill[]
  first?: boolean
}) {
  if (skills.length === 0) return null

  return (
    <>
      <div
        className={`pb-1.5 font-mono text-8 font-medium tracking-[.13em] text-brand-ink uppercase ${
          first ? "pt-0" : "pt-3"
        }`}
      >
        {label}
      </div>
      <div className="columns-2 gap-x-[1.625rem]">
        {skills.map((skill) => (
          <div
            key={skill.id}
            className="flex break-inside-avoid items-baseline gap-[0.4375rem] py-0.5 text-11 text-ink-2"
          >
            <span className="truncate">{skill.displayName}</span>
            <span
              className={`ml-auto shrink-0 font-mono text-8 font-medium tracking-[.06em] uppercase ${
                skill.install === "eject"
                  ? "text-brand-ink"
                  : "text-muted-foreground"
              }`}
            >
              {skill.install}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

// An inventory of what will be written, then the two commands that write it.
//
// There is deliberately **no Install button**: installing is a CLI action, so
// the dialog's job is to tell the user exactly what they are about to get and
// hand them the command. The only action is Close.
export function InstallDialog({
  config,
  added,
}: {
  config: ConfigSelection
  added: AddedSkill[]
}) {
  const dialog = useUiStore((state) => state.dialog)
  const setDialog = useUiStore((state) => state.setDialog)

  const inventory = selectInstallInventory(config, added)
  const stats = summarize(config)
  const stack = STACKS.find((candidate) => candidate.id === config.stackId)

  return (
    <Dialog
      open={dialog === "install"}
      onOpenChange={(open) => !open && setDialog("none")}
    >
      <DialogContent wide>
        <DialogHeader
          title="Install"
          subtitle={
            <>
              marketplace <em className="text-ink not-italic">agents-inc</em>
              {stack ? (
                <>
                  {" · "}stack{" "}
                  <em className="text-ink not-italic">
                    {stack.name.toLowerCase()}
                  </em>
                </>
              ) : null}
            </>
          }
        />

        <DialogPanes>
          <DialogPane side="left">
            <DialogPaneHeading>Skills</DialogPaneHeading>
            <ScopeGroup label="Project" skills={inventory.project} first />
            <ScopeGroup label="Global" skills={inventory.global} />
            {stats.skillCount === 0 && (
              <p className="text-11 text-muted-foreground italic">
                Nothing selected yet.
              </p>
            )}
          </DialogPane>

          <DialogPane side="right">
            <DialogPaneHeading>Agents</DialogPaneHeading>
            {/* Sub-agent front-matter is always written into the project, so
                this group is unconditional — unlike the skills pane, which
                genuinely splits by the user's per-skill scope. */}
            {inventory.agents.length > 0 && (
              <div className="pt-0 pb-1.5 font-mono text-8 font-medium tracking-[.13em] text-brand-ink uppercase">
                Project
              </div>
            )}
            {inventory.agents.map(({ agent, baseOnly }) => (
              <div key={agent.id} className="py-0.5 text-11 text-ink-2">
                {DOMAIN_LABELS[agent.domainId].toLowerCase()} ·{" "}
                {agent.label.toLowerCase()}
                {/* A pinned agent installs as front-matter alone. */}
                {baseOnly && (
                  <span className="pl-1.5 text-10 text-roster-empty">
                    no skills — base agent
                  </span>
                )}
              </div>
            ))}
          </DialogPane>
        </DialogPanes>

        <DialogRule strong />

        <DialogBody>
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="shrink-0 pt-[0.1875rem] font-mono text-10 font-medium text-brand-faint">
                01
              </span>
              <div className="min-w-0 flex-1">
                <p className="pb-1.5 text-11 leading-[1.5] text-ink-3">
                  Go to your project root — the folder holding{" "}
                  <em className="font-mono text-10 text-ink not-italic">
                    package.json
                  </em>
                  . Project-scoped skills are written relative to it.
                </p>
                <CommandBlock>cd ~/code/your-project</CommandBlock>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 pt-[0.1875rem] font-mono text-10 font-medium text-brand-faint">
                02
              </span>
              <div className="min-w-0 flex-1">
                <p className="pb-1.5 text-11 leading-[1.5] text-ink-3">
                  Run the installer. It writes{" "}
                  <em className="font-mono text-10 text-ink not-italic">
                    agents/config.ts
                  </em>{" "}
                  and sub-agent front-matter, ejects {stats.ejectedCount} skills
                  into{" "}
                  <em className="font-mono text-10 text-ink not-italic">
                    .claude/skills/
                  </em>
                  , and links the rest as plugins. Global skills land in{" "}
                  <em className="font-mono text-10 text-ink not-italic">
                    ~/.claude
                  </em>
                  .
                </p>
                <CommandBlock>npx agents-inc install</CommandBlock>
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogFooterNote>
            {stats.skillCount} skills · {stats.agentCount} sub-agents ·{" "}
            {stats.ejectedCount} ejected · re-open this configurator with{" "}
            <em className="text-ink not-italic">npx agents-inc edit --ui</em>
          </DialogFooterNote>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
